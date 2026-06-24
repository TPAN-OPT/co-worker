import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const checkJsScriptPath = resolve('scripts/check-js.mjs')

describe('check-js script', () => {
  it('checks nested JavaScript and MJS files only', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-check-js-'))

    try {
      await mkdir(join(targetDir, 'src', 'nested'), { recursive: true })
      await writeFile(join(targetDir, 'src', 'nested', 'valid.js'), 'export const ok = true\n')
      await writeFile(join(targetDir, 'src', 'nested', 'valid.mjs'), 'export const alsoOk = true\n')
      await writeFile(join(targetDir, 'src', 'nested', 'ignored.txt'), 'not javascript <<<\n')

      const { stdout } = await execFileAsync('node', [checkJsScriptPath], {
        cwd: targetDir
      })

      assert.match(stdout, /Checked 2 JavaScript files/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('fails when no JavaScript files exist', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-check-js-'))

    try {
      await assert.rejects(
        () =>
          execFileAsync('node', [checkJsScriptPath], {
            cwd: targetDir
          }),
        /No JavaScript files found/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('returns a non-zero exit when syntax checking fails', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-check-js-'))

    try {
      await mkdir(join(targetDir, 'scripts'), { recursive: true })
      await writeFile(join(targetDir, 'scripts', 'broken.mjs'), 'export const = nope\n')

      await assert.rejects(
        () =>
          execFileAsync('node', [checkJsScriptPath], {
            cwd: targetDir
          }),
        /Unexpected token/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })
})
