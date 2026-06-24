import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = resolve('src/cli.js')

describe('catalog CLI', () => {
  it('prints help for catalog-style commands', async () => {
    const commands = ['catalog', 'presets', 'templates', 'policies', 'teams', 'marketplace']

    for (const command of commands) {
      const { stdout } = await execFileAsync('node', [cliPath, command, '--help'])

      assert.match(stdout, new RegExp(`tpan-opt-co-worker ${command}`))
      assert.match(stdout, /--json/)
      if (command === 'marketplace') {
        assert.match(stdout, /--out marketplace\.json/)
        assert.doesNotMatch(stdout, /--out catalog\.json/)
      }
    }
  })

  it('rejects unknown and incomplete catalog-style options', async () => {
    await assert.rejects(
      () => execFileAsync('node', [cliPath, 'catalog', '--bogus']),
      /Unknown catalog option "--bogus"/
    )
    await assert.rejects(
      () => execFileAsync('node', [cliPath, 'catalog', '--out']),
      /--out requires a value/
    )
    await assert.rejects(
      () => execFileAsync('node', [cliPath, 'marketplace', '--out']),
      /--out requires a value/
    )
    await assert.rejects(
      () => execFileAsync('node', [cliPath, 'teams', '--bogus']),
      /Unknown teams option "--bogus"/
    )
  })

  it('lists built-in gate presets as text', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, 'presets'])

    assert.match(stdout, /Built-in gate presets/)
    assert.match(stdout, /node:test/)
    assert.match(stdout, /npm:audit-high/)
    assert.match(stdout, /npm audit --audit-level=high/)
  })

  it('lists built-in gate presets as JSON', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, 'presets', '--json'])
    const result = JSON.parse(stdout)

    assert.deepEqual(
      result.presets.find((preset) => preset.id === 'node:test'),
      {
        id: 'node:test',
        type: 'command',
        description: 'Run the Node.js test suite.',
        command: 'npm test'
      }
    )
    assert.ok(result.presets.some((preset) => preset.id === 'npm:audit-high'))
  })

  it('lists workflow templates as text', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, 'templates'])

    assert.match(stdout, /Workflow templates/)
    assert.match(stdout, /production-feature/)
    assert.match(stdout, /Planner, engineer, reviewer, and release manager/)
  })

  it('lists workflow templates as JSON', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, 'templates', '--json'])
    const result = JSON.parse(stdout)

    assert.deepEqual(result.templates, [
      {
        id: 'production-feature',
        name: 'Production Feature Workflow',
        description:
          'Planner, engineer, reviewer, and release manager workflow for verified product delivery.',
        defaultWorkflowName: 'production-feature-workflow'
      }
    ])
  })

  it('lists organization policy packs as text', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, 'policies'])

    assert.match(stdout, /Organization policy packs/)
    assert.match(stdout, /quality-standard/)
    assert.match(stdout, /Requires test, coverage, review, and release evidence/)
  })

  it('lists organization policy packs as JSON', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, 'policies', '--json'])
    const result = JSON.parse(stdout)

    assert.deepEqual(
      result.policies.find((policy) => policy.id === 'quality-standard'),
      {
        id: 'quality-standard',
        name: 'Quality Standard',
        description:
          'Requires test, coverage, review, and release evidence before work is considered complete.',
        rules: [
          'tests_first',
          'coverage_evidence',
          'review_signoff',
          'release_evidence'
        ]
      }
    )
    assert.ok(result.policies.some((policy) => policy.id === 'human-control'))
  })

  it('lists reusable agent teams as text', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, 'teams'])

    assert.match(stdout, /Reusable agent teams/)
    assert.match(stdout, /product-delivery/)
    assert.match(stdout, /planner, engineer, reviewer, release-manager/)
  })

  it('lists reusable agent teams as JSON', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, 'teams', '--json'])
    const result = JSON.parse(stdout)

    assert.deepEqual(
      result.teams.find((team) => team.id === 'product-delivery'),
      {
        id: 'product-delivery',
        name: 'Product Delivery Team',
        description:
          'Planner, engineer, reviewer, and release manager roles for verified feature delivery.',
        roles: ['planner', 'engineer', 'reviewer', 'release-manager'],
        recommendedTemplate: 'production-feature',
        recommendedPolicies: ['quality-standard', 'human-control']
      }
    )
    assert.ok(result.teams.some((team) => team.id === 'opt-core'))
  })

  it('lists marketplace distribution packages as text', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, 'marketplace'])

    assert.match(stdout, /Marketplace distribution packages/)
    assert.match(stdout, /skill:tdd-workflow/)
    assert.match(stdout, /mcp:context7/)
    assert.match(stdout, /hook:workflow-preflight/)
  })

  it('lists marketplace distribution packages as JSON', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, 'marketplace', '--json'])
    const result = JSON.parse(stdout)

    assert.deepEqual(
      result.marketplace.find((item) => item.id === 'skill:tdd-workflow'),
      {
        id: 'skill:tdd-workflow',
        type: 'skill',
        name: 'TDD Workflow',
        description:
          'Reusable test-driven development workflow skill for feature work, bug fixes, and refactoring.',
        source: 'builtin',
        tags: ['testing', 'quality', 'workflow'],
        install: {
          target: '.agents/skills/tdd-workflow',
          files: ['SKILL.md', 'agents/openai.yaml']
        }
      }
    )
    assert.ok(result.marketplace.some((item) => item.type === 'mcp'))
    assert.ok(result.marketplace.some((item) => item.type === 'hook'))
  })

  it('lists the combined catalog as text', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, 'catalog'])

    assert.ok(stdout.includes('TPAN-OPT/CO-WORKER catalog'))
    assert.match(stdout, /Presets: 5/)
    assert.match(stdout, /Templates: 1/)
    assert.match(stdout, /Policies: 3/)
    assert.match(stdout, /Teams: 3/)
    assert.match(stdout, /Marketplace: 5/)
  })

  it('lists the combined catalog as JSON', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, 'catalog', '--json'])
    const result = JSON.parse(stdout)

    assert.equal(result.presets.length, 5)
    assert.equal(result.templates[0].id, 'production-feature')
    assert.equal(result.policies[0].id, 'quality-standard')
    assert.equal(result.teams[0].id, 'product-delivery')
    assert.equal(result.marketplace[0].id, 'skill:tdd-workflow')
  })

  it('writes the combined catalog with overwrite protection', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const catalogPath = join(targetDir, 'catalog.json')

    try {
      const { stdout } = await execFileAsync('node', [
        cliPath,
        'catalog',
        '--out',
        catalogPath
      ])

      assert.match(stdout, /Wrote catalog/)
      const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
      assert.equal(catalog.presets.length, 5)
      assert.equal(catalog.teams[0].id, 'product-delivery')

      await assert.rejects(
        () => execFileAsync('node', [cliPath, 'catalog', '--out', catalogPath]),
        /Refusing to overwrite existing file/
      )

      await writeFile(catalogPath, '{}')
      await execFileAsync('node', [cliPath, 'catalog', '--out', catalogPath, '--force'])
      const overwrittenCatalog = JSON.parse(await readFile(catalogPath, 'utf8'))
      assert.equal(overwrittenCatalog.policies[0].id, 'quality-standard')
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('writes marketplace packages with overwrite protection', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-cli-'))
    const marketplacePath = join(targetDir, 'marketplace.json')

    try {
      const { stdout } = await execFileAsync('node', [
        cliPath,
        'marketplace',
        '--out',
        marketplacePath
      ])

      assert.match(stdout, /Wrote marketplace catalog/)
      const marketplace = JSON.parse(await readFile(marketplacePath, 'utf8'))
      assert.equal(marketplace.marketplace[0].id, 'skill:tdd-workflow')

      await assert.rejects(
        () => execFileAsync('node', [cliPath, 'marketplace', '--out', marketplacePath]),
        /Refusing to overwrite existing file/
      )

      await writeFile(marketplacePath, '{}')
      await execFileAsync('node', [
        cliPath,
        'marketplace',
        '--out',
        marketplacePath,
        '--force'
      ])
      const overwrittenMarketplace = JSON.parse(await readFile(marketplacePath, 'utf8'))
      assert.ok(overwrittenMarketplace.marketplace.some((item) => item.type === 'hook'))
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })
})
