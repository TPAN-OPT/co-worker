import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { renderDemoAgentScript } from '../src/demo-agent-template.js'

const execFileAsync = promisify(execFile)

// Run the generated demo agent's gate check for a stage in `cwd` and return the
// process exit code (0 = gate passes, non-zero = still open).
async function checkExitCode(cwd, stage) {
  const scriptPath = join(cwd, 'scripts', 'demo-agent.mjs')
  try {
    await execFileAsync(process.execPath, [scriptPath, '--check', stage], { cwd })
    return 0
  } catch (error) {
    return typeof error.code === 'number' ? error.code : 1
  }
}

async function scaffold() {
  const dir = await mkdtemp(join(tmpdir(), 'tpan-demo-gate-'))
  await mkdir(join(dir, 'scripts'), { recursive: true })
  await writeFile(join(dir, 'scripts', 'demo-agent.mjs'), renderDemoAgentScript())
  await mkdir(join(dir, '.tpan-opt-co-worker', 'artifacts'), { recursive: true })
  return dir
}

describe('demo agent gate content check', () => {
  it('leaves the gate open when the artifact is missing', async () => {
    const dir = await scaffold()
    assert.equal(await checkExitCode(dir, 'clarify'), 1)
  })

  it('leaves the gate open for an empty artifact', async () => {
    const dir = await scaffold()
    await writeFile(join(dir, '.tpan-opt-co-worker', 'artifacts', 'clarify.md'), '')
    assert.equal(await checkExitCode(dir, 'clarify'), 1)
  })

  it('leaves the gate open for a whitespace-only artifact', async () => {
    const dir = await scaffold()
    await writeFile(join(dir, '.tpan-opt-co-worker', 'artifacts', 'clarify.md'), '   \n\n\t  \n')
    assert.equal(await checkExitCode(dir, 'clarify'), 1)
  })

  it('passes the gate once the artifact has substantive content', async () => {
    const dir = await scaffold()
    await writeFile(
      join(dir, '.tpan-opt-co-worker', 'artifacts', 'clarify.md'),
      '# Clarify\n\nA real agent wrote a substantive result here, well over the minimum length.\n'
    )
    assert.equal(await checkExitCode(dir, 'clarify'), 0)
  })
})
