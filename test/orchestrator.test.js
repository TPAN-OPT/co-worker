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
      assert.match(summary, /# TPAN-OPT\/CO-WORKER Orchestration State/)
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
