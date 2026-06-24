import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { compileWorkflow } from '../src/compiler.js'
import { writeCompiledOutputs } from '../src/file-system.js'

const execFileAsync = promisify(execFile)

describe('generated local runner script', () => {
  it('runs workflow verification through the manifest and writes run artifacts', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-runner-'))

    try {
      await writeCompiledOutputs(compileWorkflow(localRunnerWorkflow()), targetDir, {
        force: true
      })
      const manualEvidencePath = join(targetDir, 'manual-evidence.json')
      await writeFile(
        manualEvidencePath,
        JSON.stringify({
          gates: {
            human_approval: {
              approvedBy: 'owner@example.com',
              note: 'Approved for local run.',
              links: []
            }
          }
        })
      )

      const { stdout } = await execFileAsync(
        'node',
        [
          join(targetDir, 'scripts', 'run-workflow.mjs'),
          '--run-id',
          'test-run',
          '--manual-evidence',
          manualEvidencePath
        ],
        { cwd: targetDir }
      )

      const runDir = join(targetDir, '.tpan-opt-co-worker', 'runs', 'test-run')
      const report = JSON.parse(await readFile(join(runDir, 'evidence.json'), 'utf8'))
      const summary = await readFile(join(runDir, 'summary.md'), 'utf8')
      const index = JSON.parse(
        await readFile(join(targetDir, '.tpan-opt-co-worker', 'runs', 'index.json'), 'utf8')
      )
      const consoleRuns = JSON.parse(
        await readFile(
          join(targetDir, '.tpan-opt-co-worker', 'console', 'runs.json'),
          'utf8'
        )
      )
      const consoleRunsScript = await readFile(
        join(targetDir, '.tpan-opt-co-worker', 'console', 'runs.js'),
        'utf8'
      )
      const listResult = await execFileAsync(
        'node',
        [join(targetDir, 'scripts', 'list-runs.mjs')],
        { cwd: targetDir }
      )

      assert.ok(stdout.includes('TPAN-OPT/CO-WORKER local runner'))
      assert.match(stdout, /local-runner-workflow@1.0.0/)
      assert.equal(report.allGatesPassed, true)
      assert.ok(summary.includes('# TPAN-OPT/CO-WORKER Evidence Summary'))
      assert.equal(index.runs[0].id, 'test-run')
      assert.equal(index.runs[0].status, 'passed')
      assert.equal(index.runs[0].workflow.name, 'local-runner-workflow')
      assert.deepEqual(consoleRuns.runs, index.runs)
      assert.equal(consoleRuns.details['test-run'].commandGates[0].id, 'unit_tests_pass')
      assert.equal(consoleRuns.details['test-run'].commandGates[0].status, 'passed')
      assert.equal(consoleRuns.details['test-run'].manualGates[0].id, 'human_approval')
      assert.equal(consoleRuns.details['test-run'].manualGates[0].status, 'passed')
      assert.match(consoleRunsScript, /window\.TPAN_OPT_RUNS/)
      assert.match(consoleRunsScript, /test-run/)
      assert.match(consoleRunsScript, /human_approval/)
      assert.match(listResult.stdout, /test-run/)
      assert.match(listResult.stdout, /passed/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('prints an empty run history message before any local runs exist', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-runner-'))

    try {
      await writeCompiledOutputs(compileWorkflow(localRunnerWorkflow()), targetDir, {
        force: true
      })

      const { stdout } = await execFileAsync(
        'node',
        [join(targetDir, 'scripts', 'list-runs.mjs')],
        { cwd: targetDir }
      )

      assert.ok(stdout.includes('No TPAN-OPT/CO-WORKER runs found'))
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('runs from outside the generated project directory', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-runner-'))
    const outsideDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-outside-'))

    try {
      await writeCompiledOutputs(compileWorkflow(localRunnerWorkflow()), targetDir, {
        force: true
      })
      const manualEvidencePath = join(targetDir, 'manual-evidence.json')
      await writeFile(
        manualEvidencePath,
        JSON.stringify({
          gates: {
            human_approval: {
              approvedBy: 'owner@example.com',
              note: 'Approved from an external cwd.',
              links: []
            }
          }
        })
      )

      await execFileAsync(
        'node',
        [
          join(targetDir, 'scripts', 'run-workflow.mjs'),
          '--run-id',
          'external-cwd-run',
          '--manual-evidence',
          manualEvidencePath
        ],
        { cwd: outsideDir }
      )

      const report = JSON.parse(
        await readFile(
          join(targetDir, '.tpan-opt-co-worker', 'runs', 'external-cwd-run', 'evidence.json'),
          'utf8'
        )
      )
      const index = JSON.parse(
        await readFile(join(targetDir, '.tpan-opt-co-worker', 'runs', 'index.json'), 'utf8')
      )
      const listResult = await execFileAsync(
        'node',
        [join(targetDir, 'scripts', 'list-runs.mjs'), '--json'],
        { cwd: outsideDir }
      )
      const listedRuns = JSON.parse(listResult.stdout)

      assert.equal(report.allGatesPassed, true)
      assert.equal(index.runs[0].id, 'external-cwd-run')
      assert.equal(index.runs[0].status, 'passed')
      assert.equal(listedRuns.runs[0].id, 'external-cwd-run')
    } finally {
      await rm(targetDir, { recursive: true, force: true })
      await rm(outsideDir, { recursive: true, force: true })
    }
  })

  it('rejects unsafe run ids before invoking verification', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-runner-'))

    try {
      await writeCompiledOutputs(compileWorkflow(localRunnerWorkflow()), targetDir, {
        force: true
      })

      await assert.rejects(
        () =>
          execFileAsync(
            'node',
            [join(targetDir, 'scripts', 'run-workflow.mjs'), '--run-id', '../escaped'],
            { cwd: targetDir }
          ),
        /--run-id may only contain/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('ignores unsafe runDir values from an existing run index', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-runner-'))
    const outsideDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-outside-'))

    try {
      await writeCompiledOutputs(compileWorkflow(localRunnerWorkflow()), targetDir, {
        force: true
      })
      await mkdir(join(targetDir, '.tpan-opt-co-worker', 'runs'), { recursive: true })
      await writeFile(
        join(targetDir, '.tpan-opt-co-worker', 'runs', 'index.json'),
        JSON.stringify({
          runs: [
            {
              id: 'old-run',
              workflow: {
                name: 'poisoned',
                version: '1.0.0'
              },
              runDir: `../${outsideDir.split('/').pop()}`,
              status: 'passed',
              commandPassed: true,
              allGatesPassed: true,
              finishedAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        })
      )
      await writeFile(
        join(outsideDir, 'evidence.json'),
        JSON.stringify({
          commandGates: [{ id: 'leaked_command' }],
          manualGates: [{ id: 'leaked_manual' }]
        })
      )

      await execFileAsync(
        'node',
        [join(targetDir, 'scripts', 'run-workflow.mjs'), '--run-id', 'new-run'],
        { cwd: targetDir }
      )

      const index = JSON.parse(
        await readFile(join(targetDir, '.tpan-opt-co-worker', 'runs', 'index.json'), 'utf8')
      )
      const consoleRuns = JSON.parse(
        await readFile(
          join(targetDir, '.tpan-opt-co-worker', 'console', 'runs.json'),
          'utf8'
        )
      )

      assert.equal(index.runs[1].id, 'old-run')
      assert.equal(index.runs[1].runDir, '.tpan-opt-co-worker/runs/old-run')
      assert.deepEqual(consoleRuns.details['old-run'], {
        commandGates: [],
        manualGates: []
      })
    } finally {
      await rm(targetDir, { recursive: true, force: true })
      await rm(outsideDir, { recursive: true, force: true })
    }
  })
})

function localRunnerWorkflow() {
  return {
    name: 'local-runner-workflow',
    version: '1.0.0',
    roles: {
      engineer: {
        skills: ['tdd-workflow'],
        permissions: ['run_tests']
      }
    },
    stages: [
      {
        id: 'implement',
        owner: 'engineer',
        gates: [
          {
            id: 'unit_tests_pass',
            type: 'command',
            command: 'node -e "process.exit(0)"'
          },
          {
            id: 'human_approval',
            type: 'manual',
            description: 'Human lead approved the local run.'
          }
        ]
      }
    ]
  }
}
