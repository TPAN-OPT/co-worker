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
  })

  it('runs lint, typecheck, and build scripts successfully', async () => {
    await execFileAsync('npm', ['run', 'lint'])
    await execFileAsync('npm', ['run', 'typecheck'])
    const { stdout } = await execFileAsync('npm', ['run', 'build'])

    assert.match(stdout, /Build smoke generated/)
  })
})
