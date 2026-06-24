import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { compileWorkflow } from '../src/compiler.js'

const execFileAsync = promisify(execFile)

describe('generated verify-workflow script', () => {
  it('prints help for generated verifier options', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-verify-'))

    try {
      const scriptPath = await writeVerifyScript(targetDir, {
        command: 'node -e "process.exit(0)"'
      })
      const { stdout } = await execFileAsync('node', [scriptPath, '--help'])

      assert.match(stdout, /--manual-evidence manual-evidence\.json/)
      assert.match(stdout, /--report evidence\.json/)
      assert.match(stdout, /--run-dir/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('runs command gates and prints manual gates', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-verify-'))

    try {
      const scriptPath = await writeVerifyScript(targetDir, {
        command: 'node -e "process.exit(0)"'
      })
      const { stdout } = await execFileAsync('node', [scriptPath])

      assert.match(stdout, /command:unit_tests_pass/)
      assert.match(stdout, /PASS/)
      assert.match(stdout, /manual:human_approval/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('runs command gates expanded from presets', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-verify-'))

    try {
      const scriptPath = await writeVerifyScript(targetDir, {
        preset: 'node:test',
        command: 'node -e "process.exit(0)"'
      })
      const { stdout } = await execFileAsync('node', [scriptPath])

      assert.match(stdout, /command:unit_tests_pass/)
      assert.match(stdout, /PASS/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('runs command gates expanded from workflow-defined presets', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-verify-'))

    try {
      const scriptPath = await writeVerifyScript(targetDir, {
        customPresets: {
          'team:custom-test': {
            type: 'command',
            description: 'Run a team-owned check.',
            command: 'node -e "process.exit(0)"'
          }
        },
        preset: 'team:custom-test'
      })
      const { stdout } = await execFileAsync('node', [scriptPath])

      assert.match(stdout, /command:unit_tests_pass/)
      assert.match(stdout, /PASS command:unit_tests_pass/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('exits with a non-zero status when a command gate fails', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-verify-'))

    try {
      const scriptPath = await writeVerifyScript(targetDir, {
        command: 'node -e "process.exit(7)"'
      })

      await assert.rejects(
        () => execFileAsync('node', [scriptPath]),
        /Command gate failed/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('writes a JSON evidence report when --report is provided', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-verify-'))

    try {
      const scriptPath = await writeVerifyScript(targetDir, {
        command: 'node -e "process.exit(0)"'
      })
      const reportPath = join(targetDir, 'evidence.json')

      await execFileAsync('node', [scriptPath, '--report', reportPath])

      const report = JSON.parse(await readFile(reportPath, 'utf8'))
      assert.equal(report.workflow.name, 'verify-workflow')
      assert.equal(report.passed, true)
      assert.equal(report.commandPassed, true)
      assert.equal(report.allGatesPassed, false)
      assert.deepEqual(report.commandGates[0], {
        stageId: 'implement',
        id: 'unit_tests_pass',
        preset: '',
        command: 'node -e "process.exit(0)"',
        description: '',
        status: 'passed',
        exitCode: 0
      })
      assert.deepEqual(report.manualGates[0], {
        stageId: 'implement',
        id: 'human_approval',
        preset: '',
        description: 'Human lead approved the release.',
        status: 'pending'
      })
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('writes a failed JSON evidence report before exiting non-zero', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-verify-'))

    try {
      const scriptPath = await writeVerifyScript(targetDir, {
        command: 'node -e "process.exit(7)"'
      })
      const reportPath = join(targetDir, 'evidence-failed.json')

      await assert.rejects(
        () => execFileAsync('node', [scriptPath, '--report', reportPath]),
        /Command gate failed/
      )

      const report = JSON.parse(await readFile(reportPath, 'utf8'))
      assert.equal(report.passed, false)
      assert.equal(report.commandPassed, false)
      assert.equal(report.allGatesPassed, false)
      assert.equal(report.commandGates[0].status, 'failed')
      assert.equal(report.commandGates[0].exitCode, 7)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('marks manual gates passed when --manual-evidence is provided', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-verify-'))

    try {
      const scriptPath = await writeVerifyScript(targetDir, {
        command: 'node -e "process.exit(0)"'
      })
      const reportPath = join(targetDir, 'evidence-approved.json')
      const manualEvidencePath = join(targetDir, 'manual-evidence.json')
      await writeFile(
        manualEvidencePath,
        JSON.stringify({
          gates: {
            human_approval: {
              approvedBy: 'owner@example.com',
              note: 'Release approved.',
              links: ['https://example.com/review/1']
            }
          }
        })
      )

      await execFileAsync('node', [
        scriptPath,
        '--manual-evidence',
        manualEvidencePath,
        '--report',
        reportPath
      ])

      const report = JSON.parse(await readFile(reportPath, 'utf8'))
      assert.equal(report.commandPassed, true)
      assert.equal(report.allGatesPassed, true)
      assert.deepEqual(report.manualGates[0], {
        stageId: 'implement',
        id: 'human_approval',
        preset: '',
        description: 'Human lead approved the release.',
        status: 'passed',
        evidence: {
          approvedBy: 'owner@example.com',
          note: 'Release approved.',
          links: ['https://example.com/review/1']
        }
      })
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('blocks downstream command gates when an earlier manual gate is pending', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-verify-'))

    try {
      const scriptPath = await writeCustomVerifyScript(targetDir, {
        name: 'blocked-workflow',
        version: '1.0.0',
        roles: {
          lead: {
            skills: ['release-management'],
            permissions: ['approve']
          }
        },
        stages: [
          {
            id: 'approve',
            owner: 'lead',
            gates: [
              {
                id: 'human_approval',
                type: 'manual',
                description: 'Human lead approved downstream work.'
              }
            ]
          },
          {
            id: 'deploy',
            owner: 'lead',
            gates: [
              {
                id: 'deploy_check',
                type: 'command',
                command: 'node -e "console.log(\\"DEPLOY_CHECK_RAN\\")"'
              }
            ]
          }
        ]
      })
      const reportPath = join(targetDir, 'blocked-report.json')
      const { stdout } = await execFileAsync('node', [scriptPath, '--report', reportPath])

      const report = JSON.parse(await readFile(reportPath, 'utf8'))
      assert.doesNotMatch(stdout, /DEPLOY_CHECK_RAN/)
      assert.equal(report.commandPassed, false)
      assert.equal(report.allGatesPassed, false)
      assert.deepEqual(report.commandGates[0], {
        stageId: 'deploy',
        id: 'deploy_check',
        preset: '',
        command: 'node -e "console.log(\\"DEPLOY_CHECK_RAN\\")"',
        description: '',
        status: 'skipped',
        exitCode: null,
        blockedBy: 'approve.human_approval'
      })
      assert.equal(report.manualGates[0].status, 'pending')
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('skips downstream command gates when an earlier command gate fails', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-verify-'))

    try {
      const scriptPath = await writeCustomVerifyScript(targetDir, {
        name: 'failed-command-blocking-workflow',
        version: '1.0.0',
        roles: {
          lead: {
            skills: ['verification-loop'],
            permissions: ['run_checks']
          }
        },
        stages: [
          {
            id: 'check',
            owner: 'lead',
            gates: [
              {
                id: 'first_check',
                type: 'command',
                command: 'node -e "process.exit(7)"'
              }
            ]
          },
          {
            id: 'publish',
            owner: 'lead',
            gates: [
              {
                id: 'publish_check',
                type: 'command',
                command: 'node -e "console.log(\\"PUBLISH_CHECK_RAN\\")"'
              }
            ]
          }
        ]
      })
      const reportPath = join(targetDir, 'failed-command-report.json')

      await assert.rejects(
        () => execFileAsync('node', [scriptPath, '--report', reportPath]),
        (error) => {
          assert.equal(error.code, 7)
          assert.doesNotMatch(`${error.stdout}${error.stderr}`, /PUBLISH_CHECK_RAN/)
          return true
        }
      )

      const report = JSON.parse(await readFile(reportPath, 'utf8'))
      assert.equal(report.commandGates[0].status, 'failed')
      assert.equal(report.commandGates[0].exitCode, 7)
      assert.deepEqual(report.commandGates[1], {
        stageId: 'publish',
        id: 'publish_check',
        preset: '',
        command: 'node -e "console.log(\\"PUBLISH_CHECK_RAN\\")"',
        description: '',
        status: 'skipped',
        exitCode: null,
        blockedBy: 'check.first_check'
      })
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('requires stage-scoped evidence for duplicate manual gate ids', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-verify-'))

    try {
      const scriptPath = await writeCustomVerifyScript(targetDir, {
        name: 'duplicate-manual-gates',
        version: '1.0.0',
        roles: {
          lead: {
            skills: ['release-management'],
            permissions: ['approve']
          }
        },
        stages: [
          {
            id: 'review',
            owner: 'lead',
            gates: [{ id: 'human_approval', type: 'manual' }]
          },
          {
            id: 'ship',
            owner: 'lead',
            gates: [{ id: 'human_approval', type: 'manual' }]
          }
        ]
      })
      const reportPath = join(targetDir, 'duplicate-report.json')
      const manualEvidencePath = join(targetDir, 'manual-evidence.json')
      await writeFile(
        manualEvidencePath,
        JSON.stringify({
          gates: {
            human_approval: {
              approvedBy: 'owner@example.com'
            },
            'review.human_approval': {
              approvedBy: 'reviewer@example.com'
            }
          }
        })
      )

      await execFileAsync('node', [
        scriptPath,
        '--manual-evidence',
        manualEvidencePath,
        '--report',
        reportPath
      ])

      const report = JSON.parse(await readFile(reportPath, 'utf8'))
      assert.equal(report.manualGates[0].stageId, 'review')
      assert.equal(report.manualGates[0].status, 'passed')
      assert.deepEqual(report.manualGates[0].evidence, {
        approvedBy: 'reviewer@example.com'
      })
      assert.equal(report.manualGates[1].stageId, 'ship')
      assert.equal(report.manualGates[1].status, 'pending')
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('rejects malformed manual evidence files', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-verify-'))

    try {
      const scriptPath = await writeVerifyScript(targetDir, {
        command: 'node -e "process.exit(0)"'
      })
      const invalidJsonPath = join(targetDir, 'invalid-json.json')
      const arrayEvidencePath = join(targetDir, 'array-evidence.json')
      const missingGatesPath = join(targetDir, 'missing-gates.json')
      await writeFile(invalidJsonPath, '{')
      await writeFile(arrayEvidencePath, '[]')
      await writeFile(missingGatesPath, '{"manual":{}}')

      await assert.rejects(
        () => execFileAsync('node', [scriptPath, '--manual-evidence', invalidJsonPath]),
        /Expected property name|Unexpected end of JSON input/
      )
      await assert.rejects(
        () => execFileAsync('node', [scriptPath, '--manual-evidence', arrayEvidencePath]),
        /--manual-evidence must point to a JSON object/
      )
      await assert.rejects(
        () => execFileAsync('node', [scriptPath, '--manual-evidence', missingGatesPath]),
        /--manual-evidence JSON must include a gates object/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('writes evidence and markdown summary into a run directory', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-verify-'))

    try {
      const scriptPath = await writeVerifyScript(targetDir, {
        command: 'node -e "process.exit(0)"'
      })
      const manualEvidencePath = join(targetDir, 'manual-evidence.json')
      const runDir = join(targetDir, '.tpan-opt-co-worker', 'runs', 'test-run')
      await writeFile(
        manualEvidencePath,
        JSON.stringify({
          gates: {
            human_approval: {
              approvedBy: 'owner@example.com',
              note: 'Release approved.',
              links: []
            }
          }
        })
      )

      await execFileAsync('node', [
        scriptPath,
        '--manual-evidence',
        manualEvidencePath,
        '--run-dir',
        runDir
      ])

      const report = JSON.parse(await readFile(join(runDir, 'evidence.json'), 'utf8'))
      const summary = await readFile(join(runDir, 'summary.md'), 'utf8')
      assert.equal(report.allGatesPassed, true)
      assert.ok(summary.includes('# TPAN-OPT/CO-WORKER Evidence Summary'))
      assert.match(summary, /verify-workflow@1.0.0/)
      assert.match(summary, /unit_tests_pass/)
      assert.match(summary, /human_approval/)
      assert.match(summary, /allGatesPassed: true/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })
})

async function writeVerifyScript(targetDir, commandGate) {
  const workflow = {
    name: 'verify-workflow',
    version: '1.0.0',
    gatePresets: commandGate.customPresets,
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
            type: commandGate.preset ? undefined : 'command',
            preset: commandGate.preset,
            command: commandGate.command
          },
          {
            id: 'human_approval',
            type: 'manual',
            description: 'Human lead approved the release.'
          }
        ]
      }
    ]
  }

  const outputs = compileWorkflow(workflow)
  const script = outputs.find((output) => output.path === 'scripts/verify-workflow.mjs')
  const scriptPath = join(targetDir, 'verify-workflow.mjs')
  await writeFile(scriptPath, script.content, 'utf8')
  await chmod(scriptPath, 0o755)
  return scriptPath
}

async function writeCustomVerifyScript(targetDir, workflow) {
  const outputs = compileWorkflow(workflow)
  const script = outputs.find((output) => output.path === 'scripts/verify-workflow.mjs')
  const scriptPath = join(targetDir, 'verify-workflow.mjs')
  await writeFile(scriptPath, script.content, 'utf8')
  await chmod(scriptPath, 0o755)
  return scriptPath
}
