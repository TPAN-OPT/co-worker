import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const buildSmokeScriptPath = resolve('scripts/build-smoke.mjs')

describe('build-smoke script', () => {
  it('fails clearly when the example workflow is missing', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-build-'))

    try {
      await assert.rejects(
        () => execFileAsync('node', [buildSmokeScriptPath], { cwd: targetDir }),
        /examples\/opt\.workflow\.json/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('fails clearly when the example workflow is invalid JSON', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-build-'))

    try {
      await mkdir(join(targetDir, 'examples'))
      await writeFile(join(targetDir, 'examples', 'opt.workflow.json'), '{')

      await assert.rejects(
        () => execFileAsync('node', [buildSmokeScriptPath], { cwd: targetDir }),
        /Expected property name|Unexpected end of JSON input/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })
})
