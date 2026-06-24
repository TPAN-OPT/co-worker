import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeCompiledOutputs } from '../src/file-system.js'

describe('writeCompiledOutputs', () => {
  it('writes compiled outputs under the target directory', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-'))

    try {
      const result = await writeCompiledOutputs(
        [
          {
            path: 'AGENTS.md',
            content: '# Generated'
          }
        ],
        targetDir,
        { force: false, dryRun: false }
      )

      const writtenContent = await readFile(join(targetDir, 'AGENTS.md'), 'utf8')
      assert.deepEqual(result.written, ['AGENTS.md'])
      assert.equal(writtenContent, '# Generated')
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('refuses to overwrite existing files unless force is enabled', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-'))

    try {
      await writeFile(join(targetDir, 'AGENTS.md'), '# Existing')

      await assert.rejects(
        () =>
          writeCompiledOutputs(
            [
              {
                path: 'AGENTS.md',
                content: '# Generated'
              }
            ],
            targetDir,
            { force: false, dryRun: false }
          ),
        /Refusing to overwrite existing file/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('rejects output paths that escape the target directory', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-'))

    try {
      await assert.rejects(
        () =>
          writeCompiledOutputs(
            [
              {
                path: '../AGENTS.md',
                content: '# Escaped'
              }
            ],
            targetDir,
            { force: true, dryRun: false }
          ),
        /Unsafe output path/
      )
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })
})
