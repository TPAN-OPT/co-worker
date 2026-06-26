import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = resolve('src/cli.js')

async function readConsoleOrchestration(targetDir) {
  return JSON.parse(
    await readFile(
      join(targetDir, '.tpan-opt-co-worker', 'console', 'orchestration.json'),
      'utf8'
    )
  )
}

describe('quickstart CLI', () => {
  it('scaffolds, compiles, and seeds a demo run that populates the console', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-quickstart-'))

    try {
      const { stdout } = await execFileAsync('node', [
        cliPath,
        'quickstart',
        '--out',
        targetDir,
        '--name',
        'quickstart-demo',
        '--force'
      ])

      assert.match(stdout, /Compiled \d+ harness assets/)
      assert.match(stdout, /Seeded a demo orchestration run/)
      assert.match(stdout, /Quickstart ready/)

      const workflow = JSON.parse(
        await readFile(join(targetDir, 'opt.workflow.json'), 'utf8')
      )
      assert.equal(workflow.name, 'quickstart-demo')

      // The compiled console exists and the demo run populated it: the first
      // stage is approved/done and the workflow is blocked on a later stage.
      await readFile(join(targetDir, '.tpan-opt-co-worker', 'console', 'index.html'), 'utf8')
      const orchestration = await readConsoleOrchestration(targetDir)
      assert.ok(orchestration.current, 'expected the demo run to populate orchestration state')
      assert.equal(orchestration.current.status, 'blocked')
      assert.equal(orchestration.current.stages[0].status, 'done')
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('skips the demo run with --no-demo but still compiles the console', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-quickstart-'))

    try {
      const { stdout } = await execFileAsync('node', [
        cliPath,
        'quickstart',
        '--out',
        targetDir,
        '--no-demo',
        '--force'
      ])

      assert.match(stdout, /Quickstart ready/)
      assert.doesNotMatch(stdout, /Seeded a demo orchestration run/)

      await readFile(join(targetDir, '.tpan-opt-co-worker', 'console', 'index.html'), 'utf8')
      const orchestration = await readConsoleOrchestration(targetDir)
      assert.equal(orchestration.current, null)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })
})
