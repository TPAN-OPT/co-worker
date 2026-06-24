import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = resolve('src/cli.js')

describe('init CLI', () => {
  it('initializes a starter workflow template', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')

    try {
      const { stdout } = await execFileAsync('node', [
        cliPath,
        'init',
        '--out',
        targetDir,
        '--name',
        'team-workflow'
      ])

      assert.match(stdout, /Wrote workflow template/)
      const workflow = JSON.parse(await readFile(workflowPath, 'utf8'))
      assert.equal(workflow.name, 'team-workflow')
      assert.deepEqual(Object.keys(workflow.roles), [
        'planner',
        'engineer',
        'reviewer',
        'release-manager'
      ])
      assert.ok(workflow.gatePresets['team:review-signoff'])
      assert.ok(workflow.stages.length >= 4)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('refuses to overwrite an existing starter workflow unless force is enabled', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')

    try {
      await writeFile(workflowPath, JSON.stringify({ name: 'existing-workflow' }))

      await assert.rejects(
        () =>
          execFileAsync('node', [
            cliPath,
            'init',
            '--out',
            targetDir,
            '--name',
            'blocked-workflow'
          ]),
        /Refusing to overwrite existing file/
      )

      const { stdout } = await execFileAsync('node', [
        cliPath,
        'init',
        '--out',
        targetDir,
        '--name',
        'forced-workflow',
        '--force'
      ])

      assert.match(stdout, /Wrote workflow template/)
      const workflow = JSON.parse(await readFile(workflowPath, 'utf8'))
      assert.equal(workflow.name, 'forced-workflow')
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('initializes a workflow from a named template', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')

    try {
      const { stdout } = await execFileAsync('node', [
        cliPath,
        'init',
        '--out',
        targetDir,
        '--template',
        'production-feature',
        '--name',
        'template-workflow'
      ])

      assert.match(stdout, /production-feature/)
      const workflow = JSON.parse(await readFile(workflowPath, 'utf8'))
      assert.equal(workflow.name, 'template-workflow')
      assert.equal(workflow.stages[0].id, 'clarify')
      assert.ok(workflow.roles['release-manager'])
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('initializes a language-neutral minimal workflow template', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')
    const manualEvidencePath = join(targetDir, 'manual-evidence.json')
    const reportPath = join(targetDir, 'minimal-report.json')

    try {
      const { stdout } = await execFileAsync('node', [
        cliPath,
        'init',
        '--out',
        targetDir,
        '--template',
        'minimal',
        '--name',
        'minimal-workflow'
      ])

      assert.match(stdout, /minimal/)
      const workflow = JSON.parse(await readFile(workflowPath, 'utf8'))
      assert.equal(workflow.name, 'minimal-workflow')
      assert.deepEqual(Object.keys(workflow.roles), ['lead'])
      assert.equal(workflow.stages[0].id, 'plan')
      assert.equal(
        workflow.stages.flatMap((stage) => stage.gates).every((gate) => gate.type === 'manual'),
        true
      )

      await execFileAsync('node', [
        cliPath,
        'compile',
        '--workflow',
        workflowPath,
        '--out',
        targetDir
      ])
      await writeFile(
        manualEvidencePath,
        JSON.stringify({
          gates: {
            scope_confirmed: { approvedBy: 'lead@example.com' },
            local_checks_recorded: { approvedBy: 'lead@example.com' },
            human_approval: { approvedBy: 'lead@example.com' }
          }
        })
      )
      await execFileAsync('node', [
        join(targetDir, 'scripts', 'verify-workflow.mjs'),
        '--manual-evidence',
        manualEvidencePath,
        '--report',
        reportPath
      ])

      const report = JSON.parse(await readFile(reportPath, 'utf8'))
      assert.equal(report.allGatesPassed, true)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('initializes a workflow from a reusable team recommendation', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')

    try {
      const { stdout } = await execFileAsync('node', [
        cliPath,
        'init',
        '--out',
        targetDir,
        '--team',
        'product-delivery',
        '--name',
        'team-recommended-workflow'
      ])

      assert.match(stdout, /product-delivery/)
      assert.match(stdout, /production-feature/)
      assert.match(stdout, /quality-standard, human-control/)
      const workflow = JSON.parse(await readFile(workflowPath, 'utf8'))

      assert.equal(workflow.name, 'team-recommended-workflow')
      assert.deepEqual(workflow.organization, {
        team: 'product-delivery',
        policies: ['quality-standard', 'human-control']
      })
      assert.deepEqual(Object.keys(workflow.roles), [
        'planner',
        'engineer',
        'reviewer',
        'release-manager'
      ])
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('initializes a workflow with explicit organization policies', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')

    try {
      const { stdout } = await execFileAsync('node', [
        cliPath,
        'init',
        '--out',
        targetDir,
        '--policy',
        'quality-standard',
        '--policy',
        'security-baseline',
        '--name',
        'policy-backed-workflow'
      ])

      assert.match(stdout, /quality-standard, security-baseline/)
      const workflow = JSON.parse(await readFile(workflowPath, 'utf8'))

      assert.equal(workflow.name, 'policy-backed-workflow')
      assert.deepEqual(workflow.organization, {
        policies: ['quality-standard', 'security-baseline']
      })
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('merges team-recommended and explicit organization policies', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const workflowPath = join(targetDir, 'opt.workflow.json')

    try {
      const { stdout } = await execFileAsync('node', [
        cliPath,
        'init',
        '--out',
        targetDir,
        '--team',
        'product-delivery',
        '--policy',
        'security-baseline',
        '--policy',
        'quality-standard',
        '--name',
        'merged-policy-workflow'
      ])

      assert.match(stdout, /quality-standard, human-control, security-baseline/)
      const workflow = JSON.parse(await readFile(workflowPath, 'utf8'))

      assert.deepEqual(workflow.organization, {
        team: 'product-delivery',
        policies: ['quality-standard', 'human-control', 'security-baseline']
      })
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('rejects unknown workflow templates during initialization', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))

    try {
      await assert.rejects(
        () =>
          execFileAsync('node', [
            cliPath,
            'init',
            '--out',
            targetDir,
            '--template',
            'unknown-template'
          ]),
        /Unknown workflow template "unknown-template"/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('rejects unknown reusable teams during initialization', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))

    try {
      await assert.rejects(
        () =>
          execFileAsync('node', [
            cliPath,
            'init',
            '--out',
            targetDir,
            '--team',
            'unknown-team'
          ]),
        /Unknown reusable agent team "unknown-team"/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('rejects unknown organization policies during initialization', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))

    try {
      await assert.rejects(
        () =>
          execFileAsync('node', [
            cliPath,
            'init',
            '--out',
            targetDir,
            '--policy',
            'unknown-policy'
          ]),
        /Unknown organization policy pack "unknown-policy"/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })
})
