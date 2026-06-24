#!/usr/bin/env node

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileWorkflow } from '../src/compiler.js'
import { writeCompiledOutputs } from '../src/file-system.js'

const tempDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-build-'))

try {
  const workflow = JSON.parse(await readFile('examples/opt.workflow.json', 'utf8'))
  const outputs = compileWorkflow(workflow)
  const result = await writeCompiledOutputs(outputs, tempDir, { force: true })

  console.log(`Build smoke generated ${result.written.length} files.`)
} finally {
  await rm(tempDir, { recursive: true, force: true })
}
