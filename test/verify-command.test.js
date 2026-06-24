import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const verifyScriptPath = resolve('scripts/verify.mjs')

describe('verify script', () => {
  it('runs quality gates in release order', async () => {
    const harness = await createFakeNpmHarness()

    try {
      const { stdout } = await execFileAsync('node', [verifyScriptPath], {
        env: createHarnessEnv(harness)
      })
      const calls = await readHarnessCalls(harness)

      assert.deepEqual(calls, [
        'run lint',
        'run typecheck',
        'run repo:health',
        'run test:coverage',
        'run build',
        'run pack:check',
        'audit --audit-level=high'
      ])
      assert.match(stdout, /\[verify\] lint/)
      assert.match(stdout, /\[verify\] all quality gates passed/)
    } finally {
      await rm(harness.root, { recursive: true, force: true })
    }
  })

  it('stops at the first failing quality gate', async () => {
    const harness = await createFakeNpmHarness('run test:coverage')

    try {
      await assert.rejects(
        () =>
          execFileAsync('node', [verifyScriptPath], {
            env: createHarnessEnv(harness)
          }),
        (error) => {
          assert.equal(error.code, 42)
          assert.match(`${error.stdout}${error.stderr}`, /fake npm failed: run test:coverage/)
          return true
        }
      )
      const calls = await readHarnessCalls(harness)

      assert.deepEqual(calls, [
        'run lint',
        'run typecheck',
        'run repo:health',
        'run test:coverage'
      ])
    } finally {
      await rm(harness.root, { recursive: true, force: true })
    }
  })

  it('fails when the security audit gate fails', async () => {
    const harness = await createFakeNpmHarness('audit --audit-level=high')

    try {
      await assert.rejects(
        () =>
          execFileAsync('node', [verifyScriptPath], {
            env: createHarnessEnv(harness)
          }),
        (error) => {
          assert.equal(error.code, 42)
          assert.match(`${error.stdout}${error.stderr}`, /fake npm failed: audit --audit-level=high/)
          return true
        }
      )
      const calls = await readHarnessCalls(harness)

      assert.deepEqual(calls.at(-1), 'audit --audit-level=high')
    } finally {
      await rm(harness.root, { recursive: true, force: true })
    }
  })
})

async function createFakeNpmHarness(failingCall = '') {
  const root = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-verify-'))
  const binDir = join(root, 'bin')
  const logPath = join(root, 'npm-calls.log')
  await mkdir(binDir)

  const fakeNpm = [
    '#!/usr/bin/env node',
    "import { appendFileSync } from 'node:fs'",
    'const call = process.argv.slice(2).join(" ")',
    `appendFileSync(${JSON.stringify(logPath)}, call + "\\n")`,
    `if (call === ${JSON.stringify(failingCall)}) {`,
    '  console.error("fake npm failed: " + call)',
    '  process.exit(42)',
    '}'
  ].join('\n')
  const npmPath = join(binDir, 'npm')
  const npmCmdPath = join(binDir, 'npm.cmd')
  await writeFile(npmPath, fakeNpm)
  await writeFile(npmCmdPath, fakeNpm)
  await chmod(npmPath, 0o755)
  await chmod(npmCmdPath, 0o755)

  return {
    root,
    binDir,
    logPath
  }
}

function createHarnessEnv(harness) {
  return {
    PATH: `${harness.binDir}${delimiter}${process.env.PATH}`,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR
  }
}

async function readHarnessCalls(harness) {
  const content = await readFile(harness.logPath, 'utf8')
  return content.trim().split('\n').filter(Boolean)
}
