import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { compileWorkflow } from '../src/compiler.js'
import { writeCompiledOutputs } from '../src/file-system.js'

const execFileAsync = promisify(execFile)

describe('generated orchestrator script', () => {
  it('blocks at the first stage whose gates are unsatisfied and emits a work order', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))

    try {
      await writeCompiledOutputs(compileWorkflow(orchestratorWorkflow()), targetDir, {
        force: true
      })

      const error = await runOrchestrator(targetDir, ['--run-id', 'blocked'])
      assert.equal(error.code, 1)

      const state = await readState(targetDir, 'blocked')
      assert.equal(state.status, 'blocked')
      assert.equal(state.currentStage, 'implement')

      const [implement, ship] = state.stages
      assert.equal(implement.status, 'current')
      assert.equal(gateStatus(implement, 'unit_tests_pass'), 'passed')
      assert.equal(gateStatus(implement, 'human_approval'), 'pending')

      // Stage-gated: the later stage is never evaluated while an earlier stage
      // is blocked, so its gates stay not_started (no command side effects).
      assert.equal(ship.status, 'pending')
      assert.equal(gateStatus(ship, 'release_check'), 'not_started')

      assert.equal(state.workOrder.stageId, 'implement')
      assert.equal(state.workOrder.owner, 'engineer')
      assert.deepEqual(
        state.workOrder.pendingGates.map((gate) => gate.id),
        ['human_approval']
      )
      assert.equal(state.workOrder.agents.claudeCode, '.claude/agents/engineer.md')
      assert.equal(state.workOrder.agents.codex, '.codex/agents/engineer.toml')
      assert.match(state.workOrder.nextAction, /human_approval/)

      // The orchestrator mirrors the latest state into the static console.
      const consoleState = JSON.parse(
        await readFile(
          join(targetDir, '.tpan-opt-co-worker', 'console', 'orchestration.json'),
          'utf8'
        )
      )
      assert.equal(consoleState.current.currentStage, 'implement')
      assert.equal(consoleState.current.status, 'blocked')
      const consoleScript = await readFile(
        join(targetDir, '.tpan-opt-co-worker', 'console', 'orchestration.js'),
        'utf8'
      )
      assert.match(consoleScript, /window\.TPAN_OPT_ORCHESTRATION = /)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('advances past a satisfied stage and blocks on the next stage', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))

    try {
      await writeCompiledOutputs(compileWorkflow(orchestratorWorkflow()), targetDir, {
        force: true
      })
      const evidencePath = await writeEvidence(targetDir, {
        human_approval: { approvedBy: 'lead@example.com' }
      })

      const error = await runOrchestrator(targetDir, [
        '--run-id',
        'advance',
        '--manual-evidence',
        evidencePath
      ])
      assert.equal(error.code, 1)

      const state = await readState(targetDir, 'advance')
      assert.equal(state.status, 'blocked')
      assert.equal(state.currentStage, 'ship')

      const [implement, ship] = state.stages
      assert.equal(implement.status, 'done')
      // The newly active stage's command gate did run during advancement.
      assert.equal(ship.status, 'current')
      assert.equal(gateStatus(ship, 'release_check'), 'passed')
      assert.equal(gateStatus(ship, 'release_approved'), 'pending')
      assert.equal(state.workOrder.stageId, 'ship')
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('completes with exit code 0 when every stage gate passes', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))

    try {
      await writeCompiledOutputs(compileWorkflow(orchestratorWorkflow()), targetDir, {
        force: true
      })
      const evidencePath = await writeEvidence(targetDir, {
        human_approval: { approvedBy: 'lead@example.com' },
        release_approved: { approvedBy: 'release@example.com' }
      })

      const { stdout } = await execFileAsync(
        'node',
        [
          join(targetDir, 'scripts', 'orchestrate-workflow.mjs'),
          '--run-id',
          'done',
          '--manual-evidence',
          evidencePath
        ],
        { cwd: targetDir }
      )

      const state = await readState(targetDir, 'done')
      assert.equal(state.status, 'completed')
      assert.equal(state.currentStage, null)
      assert.equal(state.workOrder, null)
      assert.ok(state.stages.every((stage) => stage.status === 'done'))

      const summary = await readFile(
        join(targetDir, '.tpan-opt-co-worker', 'orchestrations', 'done', 'state.md'),
        'utf8'
      )
      assert.ok(summary.includes('# TPAN-OPT/CO-WORKER Orchestration State'))
      assert.match(stdout, /All stages complete/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('exposes the orchestrator script in the manifest', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))

    try {
      await writeCompiledOutputs(compileWorkflow(orchestratorWorkflow()), targetDir, {
        force: true
      })
      const manifest = JSON.parse(
        await readFile(
          join(targetDir, '.tpan-opt-co-worker', 'workflow.manifest.json'),
          'utf8'
        )
      )

      assert.equal(
        manifest.harnesses.orchestrator.script,
        'scripts/orchestrate-workflow.mjs'
      )
      assert.equal(
        manifest.harnesses.orchestrator.stateDir,
        '.tpan-opt-co-worker/orchestrations'
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('invokes the owner agent and advances when it satisfies a command gate', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))

    try {
      await writeCompiledOutputs(compileWorkflow(invokeWorkflow()), targetDir, {
        force: true
      })

      const { stdout } = await execFileAsync(
        'node',
        [
          join(targetDir, 'scripts', 'orchestrate-workflow.mjs'),
          '--run-id',
          'invoked',
          '--invoke',
          '--agent-command',
          'node -e "require(\'node:fs\').writeFileSync(\'flag.txt\',\'done\')"'
        ],
        { cwd: targetDir }
      )

      const state = await readState(targetDir, 'invoked')
      assert.equal(state.status, 'completed')
      assert.equal(state.invocations.length, 1)
      assert.equal(state.invocations[0].stageId, 'build')
      assert.equal(state.invocations[0].role, 'engineer')
      assert.equal(state.invocations[0].status, 'completed')
      assert.equal(state.invocations[0].exitCode, 0)
      assert.equal(state.stages[0].status, 'done')
      assert.match(stdout, /invoke:engineer/)

      const brief = JSON.parse(
        await readFile(
          join(targetDir, '.tpan-opt-co-worker', 'orchestrations', 'invoked', 'brief-build.json'),
          'utf8'
        )
      )
      assert.equal(brief.stageId, 'build')
      assert.equal(brief.agents.claudeCode, '.claude/agents/engineer.md')
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('still blocks on a manual gate after invoking the agent', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))

    try {
      await writeCompiledOutputs(compileWorkflow(invokeWorkflow({ withManual: true })), targetDir, {
        force: true
      })

      const error = await runOrchestrator(targetDir, [
        '--run-id',
        'invoked-manual',
        '--invoke',
        '--agent-command',
        'node -e "require(\'node:fs\').writeFileSync(\'flag.txt\',\'done\')"'
      ])
      assert.equal(error.code, 1)

      const state = await readState(targetDir, 'invoked-manual')
      assert.equal(state.status, 'blocked')
      assert.equal(state.invocations.length, 1)
      assert.equal(state.invocations[0].status, 'completed')
      // The agent satisfied the command gate, but the human approval gate
      // remains pending: agents cannot self-approve.
      assert.equal(gateStatus(state.stages[0], 'build_passes'), 'passed')
      assert.equal(gateStatus(state.stages[0], 'human_approval'), 'pending')
      assert.equal(state.workOrder.invocation.status, 'completed')
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('requires an agent command when --invoke is set', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))

    try {
      await writeCompiledOutputs(compileWorkflow(orchestratorWorkflow()), targetDir, {
        force: true
      })

      await assert.rejects(
        () =>
          execFileAsync(
            'node',
            [join(targetDir, 'scripts', 'orchestrate-workflow.mjs'), '--invoke'],
            { cwd: targetDir }
          ),
        /--invoke requires --agent-command/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('uses the persisted orchestration.agentCommand when --invoke omits --agent-command', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))

    try {
      const workflow = invokeWorkflow()
      workflow.orchestration = {
        agentCommand: 'node -e "require(\'node:fs\').writeFileSync(\'flag.txt\',\'done\')"'
      }
      await writeCompiledOutputs(compileWorkflow(workflow), targetDir, { force: true })

      const { stdout } = await execFileAsync(
        'node',
        [join(targetDir, 'scripts', 'orchestrate-workflow.mjs'), '--run-id', 'persisted', '--invoke'],
        { cwd: targetDir }
      )

      const state = await readState(targetDir, 'persisted')
      assert.equal(state.status, 'completed')
      assert.equal(state.invocations.length, 1)
      assert.equal(state.invocations[0].status, 'completed')
      assert.match(stdout, /invoke:engineer/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('uses a per-role orchestration.agents command for the stage owner', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))

    try {
      const workflow = invokeWorkflow()
      workflow.orchestration = {
        agents: {
          engineer: 'node -e "require(\'node:fs\').writeFileSync(\'flag.txt\',\'done\')"'
        }
      }
      await writeCompiledOutputs(compileWorkflow(workflow), targetDir, { force: true })

      await execFileAsync(
        'node',
        [join(targetDir, 'scripts', 'orchestrate-workflow.mjs'), '--run-id', 'per-role', '--invoke'],
        { cwd: targetDir }
      )

      const state = await readState(targetDir, 'per-role')
      assert.equal(state.status, 'completed')
      assert.equal(state.invocations[0].role, 'engineer')
      assert.match(state.invocations[0].command, /writeFileSync\('flag\.txt'/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('lets a CLI --agent-command override the persisted command', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))

    try {
      const workflow = invokeWorkflow()
      // The persisted command writes the wrong file and would never satisfy the
      // gate; the CLI override must win and complete the stage.
      workflow.orchestration = {
        agentCommand: 'node -e "require(\'node:fs\').writeFileSync(\'wrong.txt\',\'no\')"'
      }
      await writeCompiledOutputs(compileWorkflow(workflow), targetDir, { force: true })

      await execFileAsync(
        'node',
        [
          join(targetDir, 'scripts', 'orchestrate-workflow.mjs'),
          '--run-id',
          'override',
          '--invoke',
          '--agent-command',
          'node -e "require(\'node:fs\').writeFileSync(\'flag.txt\',\'done\')"'
        ],
        { cwd: targetDir }
      )

      const state = await readState(targetDir, 'override')
      assert.equal(state.status, 'completed')
      assert.match(state.invocations[0].command, /writeFileSync\('flag\.txt'/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('rejects unsafe run ids', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))

    try {
      await writeCompiledOutputs(compileWorkflow(orchestratorWorkflow()), targetDir, {
        force: true
      })

      await assert.rejects(
        () =>
          execFileAsync(
            'node',
            [join(targetDir, 'scripts', 'orchestrate-workflow.mjs'), '--run-id', '../escaped'],
            { cwd: targetDir }
          ),
        /--run-id may only contain/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('schedules independent stages in parallel after a shared dependency', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))

    try {
      await writeCompiledOutputs(compileWorkflow(parallelWorkflow()), targetDir, { force: true })

      const error = await runOrchestrator(targetDir, ['--run-id', 'fanout'])
      assert.equal(error.code, 1)

      const state = await readState(targetDir, 'fanout')
      assert.equal(state.status, 'blocked')

      const byId = Object.fromEntries(state.stages.map((stage) => [stage.id, stage]))
      assert.equal(byId.plan.status, 'done')
      // Both branches off the shared `plan` stage are active at once, owned by
      // different roles — this is the multi-owner parallel scheduling.
      assert.equal(byId.backend.status, 'current')
      assert.equal(byId.frontend.status, 'current')
      assert.equal(byId.integrate.status, 'pending')

      assert.deepEqual(state.currentStages, ['backend', 'frontend'])
      assert.equal(state.workOrders.length, 2)
      assert.deepEqual(
        state.workOrders.map((order) => order.owner).sort(),
        ['backend', 'frontend']
      )
      // The join stage stays pending until both branches finish, and its gate
      // never ran (no command side effects ahead of its dependencies).
      assert.deepEqual(byId.integrate.blockedBy.sort(), ['backend', 'frontend'])
      assert.equal(gateStatus(byId.integrate, 'integration_approved'), 'not_started')
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('advances to the join stage once both parallel branches are done', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))

    try {
      await writeCompiledOutputs(compileWorkflow(parallelWorkflow()), targetDir, { force: true })
      const evidencePath = await writeEvidence(targetDir, {
        backend_approved: { approvedBy: 'backend-lead@example.com' },
        frontend_approved: { approvedBy: 'frontend-lead@example.com' }
      })

      const error = await runOrchestrator(targetDir, [
        '--run-id',
        'joined',
        '--manual-evidence',
        evidencePath
      ])
      assert.equal(error.code, 1)

      const state = await readState(targetDir, 'joined')
      const byId = Object.fromEntries(state.stages.map((stage) => [stage.id, stage]))
      assert.equal(byId.backend.status, 'done')
      assert.equal(byId.frontend.status, 'done')
      assert.equal(byId.integrate.status, 'current')
      assert.deepEqual(state.currentStages, ['integrate'])
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })
})

async function runOrchestrator(targetDir, args) {
  try {
    await execFileAsync(
      'node',
      [join(targetDir, 'scripts', 'orchestrate-workflow.mjs'), ...args],
      { cwd: targetDir }
    )
    return { code: 0 }
  } catch (error) {
    return error
  }
}

async function readState(targetDir, runId) {
  return JSON.parse(
    await readFile(
      join(targetDir, '.tpan-opt-co-worker', 'orchestrations', runId, 'state.json'),
      'utf8'
    )
  )
}

async function writeEvidence(targetDir, gates) {
  const evidencePath = join(targetDir, 'manual-evidence.json')
  await writeFile(evidencePath, JSON.stringify({ gates }))
  return evidencePath
}

function gateStatus(stage, gateId) {
  return stage.gates.find((gate) => gate.id === gateId)?.status
}

function parallelWorkflow() {
  const role = { skills: ['verification-loop'], permissions: ['write_code'] }
  return {
    name: 'parallel-workflow',
    version: '1.0.0',
    roles: {
      planner: role,
      backend: role,
      frontend: role,
      integrator: role
    },
    stages: [
      {
        id: 'plan',
        owner: 'planner',
        gates: [{ id: 'plan_ready', type: 'command', command: 'node -e "process.exit(0)"' }]
      },
      {
        id: 'backend',
        owner: 'backend',
        dependsOn: ['plan'],
        gates: [{ id: 'backend_approved', type: 'manual', description: 'Backend signed off.' }]
      },
      {
        id: 'frontend',
        owner: 'frontend',
        dependsOn: ['plan'],
        gates: [{ id: 'frontend_approved', type: 'manual', description: 'Frontend signed off.' }]
      },
      {
        id: 'integrate',
        owner: 'integrator',
        dependsOn: ['backend', 'frontend'],
        gates: [
          { id: 'integration_approved', type: 'manual', description: 'Integration signed off.' }
        ]
      }
    ]
  }
}

function invokeWorkflow({ withManual = false } = {}) {
  const gates = [
    {
      id: 'build_passes',
      type: 'command',
      command: 'node -e "process.exit(require(\'node:fs\').existsSync(\'flag.txt\') ? 0 : 1)"'
    }
  ]

  if (withManual) {
    gates.push({
      id: 'human_approval',
      type: 'manual',
      description: 'Human lead approved the build.'
    })
  }

  return {
    name: 'invoke-workflow',
    version: '1.0.0',
    roles: {
      engineer: {
        skills: ['tdd-workflow'],
        permissions: ['run_tests']
      }
    },
    stages: [
      {
        id: 'build',
        owner: 'engineer',
        gates
      }
    ]
  }
}

function orchestratorWorkflow() {
  return {
    name: 'orchestrator-workflow',
    version: '1.0.0',
    roles: {
      engineer: {
        skills: ['tdd-workflow'],
        permissions: ['run_tests']
      },
      release: {
        skills: ['verification-loop'],
        permissions: ['write_docs']
      }
    },
    stages: [
      {
        id: 'implement',
        owner: 'engineer',
        output: 'code_patch',
        required: ['tests_first', 'implementation'],
        gates: [
          {
            id: 'unit_tests_pass',
            type: 'command',
            command: 'node -e "process.exit(0)"'
          },
          {
            id: 'human_approval',
            type: 'manual',
            description: 'Human lead approved the implementation.'
          }
        ]
      },
      {
        id: 'ship',
        owner: 'release',
        gates: [
          {
            id: 'release_check',
            type: 'command',
            command: 'node -e "process.exit(0)"'
          },
          {
            id: 'release_approved',
            type: 'manual',
            description: 'Release was approved.'
          }
        ]
      }
    ]
  }
}
