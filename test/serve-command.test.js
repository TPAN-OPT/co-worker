import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { buildStatePayload, createServeServer } from '../src/serve-command.js'

const execFileAsync = promisify(execFile)
const cliPath = resolve('src/cli.js')

describe('buildStatePayload', () => {
  it('reports no run when state is missing', () => {
    const payload = buildStatePayload(null)
    assert.equal(payload.hasRun, false)
    assert.deepEqual(payload.manualGates, [])
  })

  it('surfaces only manual pending gates from open work orders', () => {
    const state = {
      status: 'blocked',
      runId: 'local',
      currentStages: ['ship'],
      workOrders: [
        {
          stageId: 'ship',
          owner: 'lead',
          pendingGates: [
            { id: 'human_approval', type: 'manual' },
            { id: 'tests', type: 'command' }
          ]
        }
      ]
    }
    const payload = buildStatePayload(state)
    assert.equal(payload.hasRun, true)
    assert.equal(payload.status, 'blocked')
    assert.deepEqual(payload.currentStages, ['ship'])
    assert.deepEqual(payload.manualGates, [
      { stageId: 'ship', gateId: 'human_approval', owner: 'lead' }
    ])
  })

  it('normalizes the legacy single workOrder / currentStage shape', () => {
    const payload = buildStatePayload({
      status: 'pending',
      currentStage: 'plan',
      workOrder: { stageId: 'plan', owner: 'planner', pendingGates: [{ id: 'g', type: 'manual' }] }
    })
    assert.deepEqual(payload.currentStages, ['plan'])
    assert.deepEqual(payload.manualGates, [{ stageId: 'plan', gateId: 'g', owner: 'planner' }])
  })
})

describe('serve live console', () => {
  let targetDir

  before(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-serve-'))
    await execFileAsync('node', [
      cliPath,
      'quickstart',
      '--out',
      targetDir,
      '--template',
      'minimal',
      '--no-demo',
      '--force'
    ])
  })

  after(async () => {
    if (targetDir) await rm(targetDir, { recursive: true, force: true })
  })

  function startServer(approve) {
    const created = createServeServer({ out: targetDir, approve })
    return new Promise((resolveStart) => {
      created.listen(0, '127.0.0.1', () => {
        const { port } = created.address()
        resolveStart({ instance: created, url: `http://127.0.0.1:${port}` })
      })
    })
  }

  function stopServer(instance) {
    instance.closeAllConnections?.()
    return new Promise((resolveStop) => instance.close(resolveStop))
  }

  it('serves the console with the live approvals panel injected', async () => {
    const started = await startServer(async () => ({}))
    try {
      const res = await fetch(started.url + '/')
      assert.equal(res.status, 200)
      assert.match(res.headers.get('content-type'), /text\/html/)
      const html = await res.text()
      assert.match(html, /Live Approvals/)
      assert.match(html, /new EventSource\('api\/events'\)/)
      assert.match(html, /api\/approve/)
    } finally {
      await stopServer(started.instance)
    }
  })

  it('neutralizes the embedded snapshot scripts so JSON is fetched live', async () => {
    const started = await startServer(async () => ({}))
    try {
      const runsJs = await (await fetch(started.url + '/runs.js')).text()
      assert.doesNotMatch(runsJs, /window\.TPAN_OPT_RUNS/)
      assert.match(runsJs, /served live/)

      const orchestration = await (await fetch(started.url + '/orchestration.json')).json()
      assert.ok('current' in orchestration)

      const catalog = await (await fetch(started.url + '/catalog.js')).text()
      assert.match(catalog, /TPAN_OPT_CATALOG/)
    } finally {
      await stopServer(started.instance)
    }
  })

  it('reports no run via /api/state before any orchestration', async () => {
    const started = await startServer(async () => ({}))
    try {
      const state = await (await fetch(started.url + '/api/state')).json()
      assert.equal(state.hasRun, false)
    } finally {
      await stopServer(started.instance)
    }
  })

  it('drives approveGate and broadcasts over SSE on POST /api/approve', async () => {
    const calls = []
    const started = await startServer(async (options) => {
      calls.push(options)
      return { advanced: true, key: 'ship.human_approval', text: 'approved' }
    })
    try {
      const controller = new AbortController()
      const events = await fetch(started.url + '/api/events', { signal: controller.signal })
      assert.equal(events.headers.get('content-type'), 'text/event-stream')
      const reader = events.body.getReader()
      const connected = new TextDecoder().decode((await reader.read()).value)
      assert.match(connected, /event: state/)

      const approveRes = await fetch(started.url + '/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gate: 'human_approval', stage: 'ship', by: 'lead@example.com', note: 'ok' })
      })
      const body = await approveRes.json()
      assert.equal(approveRes.status, 200)
      assert.equal(body.ok, true)
      assert.equal(body.advanced, true)
      assert.equal(calls.length, 1)
      assert.deepEqual(
        {
          gate: calls[0].gate,
          stage: calls[0].stage,
          approvedBy: calls[0].approvedBy,
          note: calls[0].note,
          runId: calls[0].runId
        },
        { gate: 'human_approval', stage: 'ship', approvedBy: 'lead@example.com', note: 'ok', runId: 'local' }
      )

      const pushed = new TextDecoder().decode((await reader.read()).value)
      assert.match(pushed, /approve/)
      controller.abort()
    } finally {
      await stopServer(started.instance)
    }
  })

  it('rejects an approve without a gate or approver', async () => {
    const started = await startServer(async () => ({}))
    try {
      const missingGate = await fetch(started.url + '/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ by: 'lead' })
      })
      assert.equal(missingGate.status, 400)

      const missingApprover = await fetch(started.url + '/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gate: 'g' })
      })
      assert.equal(missingApprover.status, 400)
    } finally {
      await stopServer(started.instance)
    }
  })

  it('returns 404 for unknown paths and 405 for unsupported methods', async () => {
    const started = await startServer(async () => ({}))
    try {
      assert.equal((await fetch(started.url + '/nope')).status, 404)
      assert.equal((await fetch(started.url + '/', { method: 'PUT' })).status, 405)
    } finally {
      await stopServer(started.instance)
    }
  })
})
