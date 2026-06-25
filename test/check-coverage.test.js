import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { parseCoverage } from '../scripts/check-coverage.mjs'

const execFileAsync = promisify(execFile)
const coverageScript = resolve('scripts/check-coverage.mjs')
const cleanNodeEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR
}

describe('check-coverage script', () => {
  it('passes when Node coverage summary meets every threshold', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-coverage-'))
    const sourceDir = join(targetDir, 'src')

    try {
      await mkdir(sourceDir)
      await writeFile(
        join(sourceDir, 'math.js'),
        [
          'export function add(left, right) {',
          '  return left + right',
          '}'
        ].join('\n')
      )
      await writeFile(
        join(targetDir, 'covered.test.js'),
        [
          "import { test } from 'node:test'",
          "import assert from 'node:assert/strict'",
          "import { add } from './src/math.js'",
          "test('covered', () => assert.equal(add(1, 1), 2))"
        ].join('\n')
      )

      const { stdout } = await execFileAsync('node', [coverageScript], {
        cwd: targetDir,
        env: cleanNodeEnv
      })

      assert.match(stdout, /Product coverage threshold passed/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('propagates failing node:test runs', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-coverage-'))

    try {
      await writeFile(
        join(targetDir, 'failing.test.js'),
        [
          "import { test } from 'node:test'",
          "import assert from 'node:assert/strict'",
          "test('fails', () => assert.equal(1, 2))"
        ].join('\n')
      )

      await assert.rejects(
        () => execFileAsync('node', [coverageScript], { cwd: targetDir, env: cleanNodeEnv }),
        (error) => {
          assert.equal(error.code, 1)
          assert.match(`${error.stdout}${error.stderr}`, /ERR_ASSERTION|strictly equal/)
          return true
        }
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('fails when product code coverage is below the threshold', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-coverage-'))
    const sourceDir = join(targetDir, 'src')

    try {
      await mkdir(sourceDir)
      await writeFile(
        join(sourceDir, 'branchy.js'),
        [
          'export function branchy(value) {',
          "  if (value === 'covered') {",
          "    return 'yes'",
          '  }',
          "  return 'no'",
          '}',
          '',
          'export function uncovered() {',
          "  return 'never-called'",
          '}'
        ].join('\n')
      )
      await writeFile(
        join(targetDir, 'branchy.test.js'),
        [
          "import { test } from 'node:test'",
          "import assert from 'node:assert/strict'",
          "import { branchy } from './src/branchy.js'",
          "test('covers one branch', () => assert.equal(branchy('covered'), 'yes'))"
        ].join('\n')
      )

      await assert.rejects(
        () => execFileAsync('node', [coverageScript], { cwd: targetDir, env: cleanNodeEnv }),
        /coverage .* is below 80%/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('parses the all-files coverage summary', () => {
    assert.deepEqual(
      parseCoverage('# all files       | 97.87 |    89.13 |   98.71 | '),
      {
        lines: 97.87,
        branches: 89.13,
        functions: 98.71
      }
    )
  })

  it('fails clearly when no coverage summary can be parsed', () => {
    assert.throws(
      () => parseCoverage('TAP version 13\n1..0\n'),
      /Unable to parse Node test coverage summary/
    )
  })
})
