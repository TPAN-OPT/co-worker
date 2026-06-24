import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

describe('package quality', () => {
  it('declares commercial-ready package metadata and quality scripts', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'))

    assert.equal(packageJson.repository.type, 'git')
    assert.equal(packageJson.repository.url, 'git+https://github.com/TPAN-OPT/co-worker.git')
    assert.equal(packageJson.homepage, 'https://github.com/TPAN-OPT/co-worker#readme')
    assert.equal(packageJson.bugs.url, 'https://github.com/TPAN-OPT/co-worker/issues')
    assert.ok(packageJson.keywords.includes('ai-agents'))
    assert.ok(packageJson.files.includes('src'))
    assert.ok(packageJson.files.includes('README.zh-CN.md'))
    assert.equal(packageJson.scripts.lint, 'node scripts/check-js.mjs')
    assert.equal(packageJson.scripts.typecheck, 'node scripts/check-js.mjs')
    assert.equal(packageJson.scripts.build, 'node scripts/build-smoke.mjs')
    assert.equal(packageJson.scripts['test:coverage'], 'node scripts/check-coverage.mjs')
    assert.equal(packageJson.scripts['repo:health'], 'node scripts/repo-health.mjs')
    assert.equal(packageJson.scripts['pack:check'], 'node scripts/pack-smoke.mjs')
    assert.equal(packageJson.scripts.verify, 'node scripts/verify.mjs')
  })

  it('runs local quality scripts successfully', async () => {
    await execFileAsync('npm', ['run', 'lint'])
    await execFileAsync('npm', ['run', 'typecheck'])
    await execFileAsync('npm', ['run', 'repo:health'])
    const packResult = await execFileAsync('npm', ['run', 'pack:check'])
    const { stdout } = await execFileAsync('npm', ['run', 'build'])

    assert.match(packResult.stdout, /Package smoke contains/)
    assert.match(stdout, /Build smoke generated/)
  })

  it('defines GitHub Actions CI with the same quality gates', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8')

    assert.match(workflow, /npm ci/)
    assert.match(workflow, /npm run lint/)
    assert.match(workflow, /npm run typecheck/)
    assert.match(workflow, /npm run repo:health/)
    assert.match(workflow, /npm run test:coverage/)
    assert.match(workflow, /npm run build/)
    assert.match(workflow, /npm run pack:check/)
    assert.match(workflow, /npm audit --audit-level=high/)
  })
})
