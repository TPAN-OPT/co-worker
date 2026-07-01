import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmodSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = resolve('src/cli.js')

// The --real path shells out to an agent CLI and the orchestrator resolves
// `node`/agent from PATH, so these tests build a hermetic bin dir (a `node`
// symlink plus a fake agent) and hand it to the CLI as its PATH. POSIX only:
// the fake agents are /bin/sh scripts and rely on /usr/bin:/bin for coreutils.
const isWindows = process.platform === 'win32'

// Fake agent that behaves like a real one: reads TPAN_OPT_STAGE and writes a
// substantive artifact to the swap-seam path so the gates cascade.
const REAL_AGENT = [
  '#!/bin/sh',
  'mkdir -p .tpan-opt-co-worker/artifacts',
  'printf "# %s\\n\\nReal work by the fake agent for stage %s, well over the minimum content length.\\n" "$TPAN_OPT_STAGE" "$TPAN_OPT_STAGE" > ".tpan-opt-co-worker/artifacts/$TPAN_OPT_STAGE.md"',
  ''
].join('\n')

// Fake agent that produces nothing, leaving every command gate open.
const NOOP_AGENT = '#!/bin/sh\nexit 0\n'

function makeBin() {
  const dir = mkdtempSync(join(tmpdir(), 'tpan-qs-bin-'))
  symlinkSync(process.execPath, join(dir, 'node'))
  return dir
}

function writeFakeAgent(binDir, name, body) {
  const file = join(binDir, name)
  writeFileSync(file, body)
  chmodSync(file, 0o755)
}

function hermeticEnv(binDir) {
  return { ...process.env, PATH: [binDir, '/usr/bin', '/bin'].join(delimiter) }
}

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

  it('labels the default run as the offline demo and points at a real agent', { skip: isWindows }, async () => {
    const bin = makeBin() // node only, no agent on PATH
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-quickstart-'))

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [cliPath, 'quickstart', '--out', targetDir, '--no-open', '--force'],
        { env: hermeticEnv(bin) }
      )

      assert.match(stdout, /OFFLINE demo/)
      assert.match(stdout, /placeholder artifacts, not real work/)
      assert.match(stdout, /install claude, codex, or cursor-agent/)
      assert.doesNotMatch(stdout, /produced REAL work/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('surfaces a detected agent and the one-flag path to a real run', { skip: isWindows }, async () => {
    const bin = makeBin()
    writeFakeAgent(bin, 'claude', NOOP_AGENT) // detected but never executed in default mode
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-quickstart-'))

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [cliPath, 'quickstart', '--out', targetDir, '--no-open', '--force'],
        { env: hermeticEnv(bin) }
      )

      assert.match(stdout, /Detected claude on your PATH/)
      assert.match(stdout, /quickstart --real --force/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('with --real drives a detected agent to produce real artifacts', { skip: isWindows }, async () => {
    const bin = makeBin()
    writeFakeAgent(bin, 'claude', REAL_AGENT)
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-quickstart-'))

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [cliPath, 'quickstart', '--out', targetDir, '--real', '--no-open', '--force'],
        { env: hermeticEnv(bin) }
      )

      assert.match(stdout, /produced REAL work/)
      assert.match(stdout, /approve human_approval --stage ship --by you --run-id real/)

      // Real work landed at the stable agent artifact path (not the demo path),
      // and the same gates cascaded to a run blocked only on human approval.
      for (const stage of ['clarify', 'implement', 'review', 'ship']) {
        await readFile(join(targetDir, '.tpan-opt-co-worker', 'artifacts', `${stage}.md`), 'utf8')
      }
      const orchestration = await readConsoleOrchestration(targetDir)
      assert.equal(orchestration.current.status, 'blocked')
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('with --real reports honestly when the agent produces nothing', { skip: isWindows }, async () => {
    const bin = makeBin()
    writeFakeAgent(bin, 'claude', NOOP_AGENT)
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-quickstart-'))

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [cliPath, 'quickstart', '--out', targetDir, '--real', '--no-open', '--force'],
        { env: hermeticEnv(bin) }
      )

      assert.match(stdout, /did not complete every stage/)
      assert.doesNotMatch(stdout, /produced REAL work/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('with --real but no agent falls back to the offline demo and says so', { skip: isWindows }, async () => {
    const bin = makeBin() // node only, no agent
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-quickstart-'))

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [cliPath, 'quickstart', '--out', targetDir, '--real', '--no-open', '--force'],
        { env: hermeticEnv(bin) }
      )

      assert.match(stdout, /--real requested but .* was not found on PATH/)
      assert.match(stdout, /Running the offline demo instead/)
      assert.match(stdout, /approve human_approval --stage ship --by you/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })
})
