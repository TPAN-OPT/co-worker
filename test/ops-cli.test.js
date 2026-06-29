import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = resolve('src/cli.js')

function run(args, cwd) {
  return execFileAsync('node', [cliPath, ...args], cwd ? { cwd } : undefined)
}

describe('status / next / approve CLI', () => {
  it('reports status and drives a gate to advance the orchestrator', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-ops-'))

    try {
      await run(['quickstart', '--out', targetDir, '--template', 'minimal', '--no-demo', '--force'])

      const status = await run(['status', '--out', targetDir])
      assert.match(status.stdout, /Workflow: /)
      assert.match(status.stdout, /Orchestration: not run yet/)
      assert.match(status.stdout, /not started\s+plan/)

      const nextBefore = await run(['next', '--out', targetDir])
      assert.match(nextBefore.stdout, /No orchestration run recorded yet/)

      const approve = await run([
        'approve',
        'scope_confirmed',
        '--stage',
        'plan',
        '--by',
        'lead@example.com',
        '--out',
        targetDir
      ])
      assert.match(approve.stdout, /Recorded approval for plan\.scope_confirmed/)
      assert.match(approve.stdout, /verify/)

      const nextAfter = await run(['next', '--out', targetDir])
      assert.match(nextAfter.stdout, /Status: blocked/)
      assert.match(nextAfter.stdout, /verify/)

      const statusAfter = await run(['status', '--out', targetDir])
      assert.match(statusAfter.stdout, /done\s+plan/)
      assert.match(statusAfter.stdout, /current\s+verify/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('inspects a specific run with --run-id on status and next', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-ops-runid-'))

    try {
      // quickstart seeds a real run under the default run id "local".
      await run(['quickstart', '--out', targetDir, '--no-open', '--force'])

      // The named run resolves to that run's own state file.
      const statusLocal = await run(['status', '--out', targetDir, '--run-id', 'local'])
      assert.match(statusLocal.stdout, /Orchestration: blocked/)
      assert.match(statusLocal.stdout, /done\s+clarify/)

      const nextLocal = await run(['next', '--out', targetDir, '--run-id', 'local'])
      assert.match(nextLocal.stdout, /Status: blocked/)
      assert.match(nextLocal.stdout, /ship/)

      // An unknown run id reports no recorded run rather than the latest one.
      const nextMissing = await run(['next', '--out', targetDir, '--run-id', 'nope'])
      assert.match(nextMissing.stdout, /No orchestration run recorded yet for run "nope"/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('errors clearly when approve is missing required arguments', async () => {
    await assert.rejects(() => run(['approve', '--out', '.']), /approve requires a gate id/)
    await assert.rejects(() => run(['approve', 'some_gate']), /approve requires --by/)
  })

  it('rejects --run-id on dashboard, which aggregates across runs', async () => {
    await assert.rejects(
      () => run(['dashboard', '--out', '.', '--run-id', 'x']),
      /Unknown dashboard option "--run-id"/
    )
  })
})
