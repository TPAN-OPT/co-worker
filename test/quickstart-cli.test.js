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
  it('runs the four-role agent team end to end and stops at one human approval', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-quickstart-'))

    try {
      const { stdout } = await execFileAsync('node', [
        cliPath,
        'quickstart',
        '--out',
        targetDir,
        '--name',
        'quickstart-demo',
        '--no-open',
        '--force'
      ])

      assert.match(stdout, /Compiled \d+ harness assets/)
      assert.match(stdout, /agent team just ran end to end/)
      assert.match(stdout, /approve human_approval --stage ship --by you/)
      assert.match(stdout, /Quickstart ready/)

      const workflow = JSON.parse(
        await readFile(join(targetDir, 'opt.workflow.json'), 'utf8')
      )
      assert.equal(workflow.name, 'quickstart-demo')

      // The demo run drove every owner agent: the run is blocked only on the
      // final human-approval gate, and every earlier stage is done.
      await readFile(join(targetDir, '.tpan-opt-co-worker', 'console', 'index.html'), 'utf8')
      const orchestration = await readConsoleOrchestration(targetDir)
      assert.ok(orchestration.current, 'expected the demo run to populate orchestration state')
      assert.equal(orchestration.current.status, 'blocked')
      assert.equal(orchestration.current.stages[0].status, 'done')

      // The bundled demo agent was really invoked once per role and produced a
      // visible artifact for each stage — the point of the demo.
      const invocations = orchestration.current.invocations || []
      assert.equal(invocations.length, 4)
      assert.ok(invocations.every((invocation) => invocation.status === 'completed'))
      for (const stage of ['clarify', 'implement', 'review', 'ship']) {
        await readFile(
          join(targetDir, '.tpan-opt-co-worker', 'demo', 'artifacts', `${stage}.md`),
          'utf8'
        )
      }
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
        '--no-open',
        '--force'
      ])

      assert.match(stdout, /Quickstart ready/)
      assert.doesNotMatch(stdout, /agent team just ran end to end/)

      await readFile(join(targetDir, '.tpan-opt-co-worker', 'console', 'index.html'), 'utf8')
      const orchestration = await readConsoleOrchestration(targetDir)
      assert.equal(orchestration.current, null)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })
})
