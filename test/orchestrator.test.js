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

  it('--loop retries the owner agent across passes until a command gate passes', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))
    // The agent succeeds only on its second invocation: it bumps a counter and
    // writes the flag the command gate checks once the counter reaches two. One
    // pass (one invoke) is not enough; --loop must retry for the run to finish.
    const agentCommand =
      'node -e "const fs=require(\'node:fs\');const n=(fs.existsSync(\'c\')?Number(fs.readFileSync(\'c\',\'utf8\')):0)+1;fs.writeFileSync(\'c\',String(n));if(n>=2)fs.writeFileSync(\'flag.txt\',\'done\')"'
    const retryWorkflow = {
      name: 'retry-workflow',
      version: '1.0.0',
      roles: { engineer: { skills: ['tdd-workflow'], permissions: ['write_code'] } },
      stages: [
        {
          id: 'build',
          owner: 'engineer',
          gates: [{ id: 'build_passes', type: 'command', command: 'test -f flag.txt' }]
        }
      ]
    }

    try {
      await writeCompiledOutputs(compileWorkflow(retryWorkflow), targetDir, { force: true })

      // Single pass: one invoke -> counter 1, flag absent -> blocked.
      const single = await runOrchestrator(targetDir, [
        '--run-id',
        'single',
        '--invoke',
        '--agent-command',
        agentCommand
      ])
      assert.equal(single.code, 1)
      assert.equal((await readState(targetDir, 'single')).status, 'blocked')

      // Reset side effects, then --loop retries and completes on the second pass.
      await rm(join(targetDir, 'c'), { force: true })
      await rm(join(targetDir, 'flag.txt'), { force: true })
      const { stdout } = await execFileAsync(
        'node',
        [
          join(targetDir, 'scripts', 'orchestrate-workflow.mjs'),
          '--run-id',
          'looped',
          '--invoke',
          '--agent-command',
          agentCommand,
          '--loop'
        ],
        { cwd: targetDir }
      )

      const loopState = await readState(targetDir, 'looped')
      assert.equal(loopState.status, 'completed')
      assert.equal(loopState.stages[0].status, 'done')
      assert.ok(loopState.invocations.length >= 2)
      assert.match(stdout, /Pass 2\//)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('--loop stops without spinning when a manual gate stays pending', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))

    try {
      await writeCompiledOutputs(compileWorkflow(orchestratorWorkflow()), targetDir, {
        force: true
      })

      const error = await runOrchestrator(targetDir, [
        '--run-id',
        'loop-stall',
        '--loop',
        '--max-iterations',
        '5'
      ])
      assert.equal(error.code, 1)

      const state = await readState(targetDir, 'loop-stall')
      assert.equal(state.status, 'blocked')
      assert.equal(state.currentStage, 'implement')
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

  it('carries the stage+node tool scope into the work order brief', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))

    try {
      await writeCompiledOutputs(compileWorkflow(toolingWorkflow()), targetDir, { force: true })

      const error = await runOrchestrator(targetDir, ['--run-id', 'scoped'])
      assert.equal(error.code, 1)

      const state = await readState(targetDir, 'scoped')
      const { tooling, nodes } = state.workOrder
      // Union of stage tooling and every node's tooling, de-duplicated.
      assert.deepEqual(tooling.skills, ['stage-skill', 'unit-skill'])
      assert.deepEqual(tooling.mcpServers, ['ctx7'])
      assert.deepEqual(tooling.hooks, ['guard'])
      // Per-node breakdown so an agent owning a single node sees only its slice.
      const byId = Object.fromEntries(nodes.map((node) => [node.id, node]))
      assert.deepEqual(byId.unit.skills, ['unit-skill'])
      assert.deepEqual(byId.unit.hooks, ['guard'])
      assert.deepEqual(byId.integration.mcpServers, ['ctx7'])
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('hands the tool scope to the invoked agent via env vars and command placeholders', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-orch-'))
    const agentCommand =
      'node -e "require(\'node:fs\').writeFileSync(\'scope.txt\',[process.env.TPAN_OPT_SKILLS,process.env.TPAN_OPT_MCP_SERVERS,process.env.TPAN_OPT_HOOKS].join(\'|\'))" # tools {skills}'

    try {
      await writeCompiledOutputs(compileWorkflow(toolingWorkflow()), targetDir, { force: true })

      const error = await runOrchestrator(targetDir, [
        '--run-id',
        'invoked',
        '--invoke',
        '--agent-command',
        agentCommand
      ])
      assert.equal(error.code, 1)

      // Env vars delivered the union scope to the agent process.
      const scope = await readFile(join(targetDir, 'scope.txt'), 'utf8')
      assert.equal(scope, 'stage-skill,unit-skill|ctx7|guard')

      // The {skills} placeholder expanded in the rendered (and persisted) command.
      const invocation = JSON.parse(
        await readFile(
          join(targetDir, '.tpan-opt-co-worker', 'orchestrations', 'invoked', 'invocation-implement.json'),
          'utf8'
        )
      )
      assert.match(invocation.command, /tools stage-skill,unit-skill/)
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

// A single blocked stage (pending manual gate) whose tooling lives partly on the
// stage and partly on its sub-nodes, so tests can assert the invoke-time union
// and the per-node breakdown.
function toolingWorkflow() {
  return {
    name: 'tooling-workflow',
    version: '1.0.0',
    mcpServers: { ctx7: { command: 'echo', args: ['ctx7'] } },
    hooks: [{ id: 'guard', event: 'pre-tool', command: 'echo guard' }],
    roles: { engineer: { skills: ['tdd'], permissions: ['run_tests'] } },
    stages: [
      {
        id: 'implement',
        owner: 'engineer',
        skills: ['stage-skill'],
        mcpServers: ['ctx7'],
        gates: [{ id: 'human_approval', type: 'manual', description: 'Lead approves.' }],
        nodes: [
          { id: 'unit', owner: 'engineer', skills: ['unit-skill'], hooks: ['guard'], gates: [] },
          { id: 'integration', owner: 'engineer', mcpServers: ['ctx7'], gates: [] }
        ]
      }
    ]
  }
}
