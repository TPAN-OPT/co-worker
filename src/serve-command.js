import { createServer } from 'node:http'
import { watch } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { approveGate, readOrchestrationState } from './ops-commands.js'

// Interactive live console. The static console (compile output) is a portable
// HTML artifact that must be re-generated to reflect new state; `serve` puts a
// tiny zero-dependency http server (node:http only) in front of that same
// console so the browser stays live and can drive approvals. It reuses the
// exact ops-commands functions the CLI/MCP use, so approving in the browser is
// identical to `tpan-opt-co-worker approve`.
const CONSOLE_REL = '.tpan-opt-co-worker/console'
const WATCH_REL = '.tpan-opt-co-worker'
const DEFAULT_PORT = 4318
const DEFAULT_HOST = '127.0.0.1'
const MAX_BODY_BYTES = 64 * 1024
const EMPTY_RUNS = { runs: [], details: {} }
const EMPTY_ORCHESTRATION = { current: null }

// Server factory kept separate from runServe so tests can listen on port 0 and
// inject a stub approve function without spawning the real orchestrator.
export function createServeServer({
  out = '.',
  approve = approveGate,
  readState = readOrchestrationState
} = {}) {
  const targetDir = resolve(out)
  const consoleDir = resolve(targetDir, CONSOLE_REL)
  const clients = new Set()
  const broadcast = (reason) => {
    const chunk = `event: state\ndata: ${JSON.stringify({ reason })}\n\n`
    for (const client of clients) {
      try {
        client.write(chunk)
      } catch {
        clients.delete(client)
      }
    }
  }

  const context = { out, consoleDir, approve, readState, clients, broadcast }
  const server = createServer((req, res) => {
    handleRequest(req, res, context).catch((error) => sendError(res, 500, error.message))
  })
  server.broadcast = broadcast
  server.clients = clients
  return server
}

export async function runServe(args) {
  const options = parseServeArgs(args)
  const targetDir = resolve(options.out)
  const indexPath = resolve(targetDir, CONSOLE_REL, 'index.html')

  if (!(await fileExists(indexPath))) {
    console.error(
      `No compiled console found at ${indexPath}.\nRun \`tpan-opt-co-worker quickstart\` or \`compile\` first.`
    )
    process.exitCode = 1
    return
  }

  const server = createServeServer({ out: options.out })
  const watcher = startWatcher(resolve(targetDir, WATCH_REL), server.broadcast)

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${options.port} is already in use. Try \`tpan-opt-co-worker serve --port <n>\`.`)
    } else {
      console.error(`Server error: ${error.message}`)
    }
    process.exitCode = 1
  })

  server.listen(options.port, options.host, () => {
    const url = `http://${options.host}:${options.port}/`
    console.log(`TPAN-OPT/CO-WORKER live console at ${url}`)
    console.log('Approve manual gates in the browser; state updates live. Press Ctrl+C to stop.')
    if (options.open) {
      openInBrowser(url)
    }
  })

  const shutdown = () => {
    if (watcher) watcher.close()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 500).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

async function handleRequest(req, res, ctx) {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname

  if (req.method === 'GET') {
    if (path === '/' || path === '/index.html') return sendConsole(res, ctx)
    if (path === '/api/events') return openEventStream(res, ctx)
    if (path === '/api/state') return sendState(res, ctx)
    if (path === '/catalog.js') {
      return sendFile(res, resolve(ctx.consoleDir, 'catalog.js'), 'text/javascript; charset=utf-8')
    }
    // Neutralize the embedded snapshots so the console falls through to fetching
    // the JSON, which we serve live from disk.
    if (path === '/runs.js' || path === '/orchestration.js') {
      return sendText(res, 200, '// served live by tpan-opt-co-worker serve\n', 'text/javascript; charset=utf-8')
    }
    if (path === '/runs.json') {
      return sendJsonFile(res, resolve(ctx.consoleDir, 'runs.json'), EMPTY_RUNS)
    }
    if (path === '/orchestration.json') {
      return sendJsonFile(res, resolve(ctx.consoleDir, 'orchestration.json'), EMPTY_ORCHESTRATION)
    }
    return sendError(res, 404, 'Not found')
  }

  if (req.method === 'POST' && path === '/api/approve') {
    return handleApprove(req, res, ctx)
  }

  return sendError(res, 405, 'Method not allowed')
}

async function sendConsole(res, ctx) {
  let html
  try {
    html = await readFile(resolve(ctx.consoleDir, 'index.html'), 'utf8')
  } catch {
    return sendError(res, 404, 'Console not compiled. Run quickstart or compile first.')
  }
  const injected = html.replace('</body>', `${LIVE_PANEL}\n</body>`)
  sendText(res, 200, injected, 'text/html; charset=utf-8')
}

async function sendState(res, ctx) {
  const state = await ctx.readState(ctx.out)
  sendJson(res, 200, buildStatePayload(state))
}

// Reduce the orchestration state to what the live approve panel needs: the
// manual gates that are currently blocking an open work order.
export function buildStatePayload(state) {
  if (!state || typeof state !== 'object') {
    return { hasRun: false, status: 'not run', currentStages: [], manualGates: [] }
  }
  const workOrders = state.workOrders || (state.workOrder ? [state.workOrder] : [])
  const currentStages = state.currentStages || (state.currentStage ? [state.currentStage] : [])
  const manualGates = []
  for (const order of workOrders) {
    if (!order || typeof order !== 'object') continue
    const pending = Array.isArray(order.pendingGates) ? order.pendingGates : []
    for (const gate of pending) {
      if (gate && gate.type === 'manual') {
        manualGates.push({ stageId: order.stageId, gateId: gate.id, owner: order.owner || '' })
      }
    }
  }
  return {
    hasRun: true,
    status: state.status || 'pending',
    runId: state.runId || '',
    currentStages,
    manualGates
  }
}

async function handleApprove(req, res, ctx) {
  let payload
  try {
    const body = await readBody(req)
    payload = body ? JSON.parse(body) : {}
  } catch (error) {
    return sendError(res, 400, `Invalid request body: ${error.message}`)
  }

  const gate = readStringField(payload.gate)
  const approvedBy = readStringField(payload.by)
  const stage = readStringField(payload.stage)
  const note = readStringField(payload.note)
  const runId = readStringField(payload.runId) || 'local'

  if (!gate) return sendError(res, 400, 'A gate id is required.')
  if (!approvedBy) return sendError(res, 400, 'An approver name is required.')

  try {
    const result = await ctx.approve({ out: ctx.out, gate, stage, approvedBy, note, runId })
    ctx.broadcast('approve')
    sendJson(res, 200, {
      ok: true,
      advanced: Boolean(result.advanced),
      key: result.key,
      text: result.text
    })
  } catch (error) {
    sendError(res, 500, error.message)
  }
}

function openEventStream(res, ctx) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  res.write('retry: 3000\n\n')
  // Prime the client so it renders live data as soon as it connects.
  res.write('event: state\ndata: {"reason":"connected"}\n\n')
  ctx.clients.add(res)
  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch {
      /* client gone; close handler cleans up */
    }
  }, 25000)
  res.on('close', () => {
    clearInterval(ping)
    ctx.clients.delete(res)
  })
}

function startWatcher(dir, broadcast) {
  let timer = null
  try {
    const watcher = watch(dir, { recursive: true }, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => broadcast('change'), 150)
    })
    watcher.on('error', () => {})
    return watcher
  } catch {
    // Recursive watch unsupported here; approvals still push via broadcast.
    return null
  }
}

function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        rejectBody(new Error('Request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', rejectBody)
  })
}

function sendText(res, status, body, contentType) {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' })
  res.end(body)
}

function sendJson(res, status, obj) {
  sendText(res, status, JSON.stringify(obj), 'application/json; charset=utf-8')
}

function sendError(res, status, messageText) {
  if (res.headersSent) {
    try {
      res.end()
    } catch {
      /* already closed */
    }
    return
  }
  sendJson(res, status, { ok: false, error: messageText })
}

async function sendFile(res, path, contentType) {
  try {
    const content = await readFile(path, 'utf8')
    sendText(res, 200, content, contentType)
  } catch {
    sendError(res, 404, 'Not found')
  }
}

async function sendJsonFile(res, path, fallback) {
  try {
    const content = await readFile(path, 'utf8')
    sendText(res, 200, content, 'application/json; charset=utf-8')
  } catch {
    sendJson(res, 200, fallback)
  }
}

function readStringField(value) {
  return typeof value === 'string' ? value.trim() : ''
}

async function fileExists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function openInBrowser(url) {
  if (!process.stdout.isTTY || process.env.CI) {
    return false
  }
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const openerArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  try {
    const child = spawn(opener, openerArgs, { stdio: 'ignore', detached: true })
    child.on('error', () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}

function parseServeArgs(args) {
  const options = { out: '.', port: DEFAULT_PORT, host: DEFAULT_HOST, open: true }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--out') {
      options.out = requireNextValue(args, index, '--out')
      index += 1
      continue
    }

    if (arg === '--port') {
      options.port = parsePort(requireNextValue(args, index, '--port'))
      index += 1
      continue
    }

    if (arg === '--host') {
      options.host = requireNextValue(args, index, '--host')
      index += 1
      continue
    }

    if (arg === '--no-open') {
      options.open = false
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printServeHelp()
      process.exit(0)
    }

    throw new Error(`Unknown serve option "${arg}"`)
  }

  return options
}

function parsePort(value) {
  const port = Number.parseInt(value, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--port must be a number between 1 and 65535 (got "${value}")`)
  }
  return port
}

function requireNextValue(args, index, name) {
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }
  return value
}

function printServeHelp() {
  console.log(`Usage:
  tpan-opt-co-worker serve [--out .] [--port ${DEFAULT_PORT}] [--host ${DEFAULT_HOST}] [--no-open]

Serves the compiled console as a live, interactive dashboard. The browser
auto-refreshes as orchestration state changes and can approve manual gates
(same effect as \`tpan-opt-co-worker approve\`). Binds to ${DEFAULT_HOST} only.

Options:
  --out <dir>    Compiled repository directory. Defaults to current directory.
  --port <n>     Port to listen on. Defaults to ${DEFAULT_PORT}.
  --host <addr>  Interface to bind. Defaults to ${DEFAULT_HOST} (localhost only).
  --no-open      Do not auto-open the browser.`)
}

// Injected into the served console before </body>. Adds a Live Approvals panel
// and wires an SSE stream that re-runs the console's existing loaders on every
// state change. Uses no template literals so it embeds cleanly in this module's
// own template string.
const LIVE_PANEL = `<style>
  #serve-live .serve-identity { display: flex; gap: 12px; flex-wrap: wrap; margin: 8px 0 12px; }
  #serve-live .serve-identity input { padding: 6px 8px; border: 1px solid #d0d7de; border-radius: 6px; min-width: 180px; font: inherit; }
  #serve-live .serve-approve { cursor: pointer; }
  #serve-live .serve-error { color: #b42318; }
</style>
<section class="panel" id="serve-live" aria-labelledby="serve-live-title">
  <div class="section-head">
    <h2 id="serve-live-title">Live Approvals</h2>
    <span id="serve-conn" class="chip">connecting…</span>
  </div>
  <p class="muted">Served live by <code>tpan-opt-co-worker serve</code>. Approving a manual gate here records evidence and advances the orchestrator — identical to the CLI <code>approve</code> command.</p>
  <div class="serve-identity">
    <label>Approver<br><input id="serve-approver" type="text" placeholder="your name" autocomplete="name"></label>
    <label>Note (optional)<br><input id="serve-note" type="text" placeholder="reason / link"></label>
  </div>
  <div id="serve-pending" class="muted">Loading pending approvals…</div>
  <div id="serve-message" class="muted" role="status" aria-live="polite"></div>
</section>
<script>
(function () {
  var connEl = document.getElementById('serve-conn')
  var pendingEl = document.getElementById('serve-pending')
  var msgEl = document.getElementById('serve-message')
  var approverEl = document.getElementById('serve-approver')
  var noteEl = document.getElementById('serve-note')
  var esc = window.escapeHtml || function (v) { return String(v) }

  try { approverEl.value = window.localStorage.getItem('tpan-opt-co-worker-approver') || '' } catch (e) {}
  approverEl.addEventListener('change', function () {
    try { window.localStorage.setItem('tpan-opt-co-worker-approver', approverEl.value.trim()) } catch (e) {}
  })

  function setConn(text) { connEl.textContent = text }

  function refreshAll() {
    if (typeof window.loadRunHistory === 'function') window.loadRunHistory()
    if (typeof window.loadOrchestration === 'function') window.loadOrchestration()
    loadPending()
  }

  function loadPending() {
    fetch('api/state', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(renderPending)
      .catch(function () {})
  }

  function renderPending(state) {
    if (!state) { pendingEl.className = 'muted'; pendingEl.textContent = 'Unable to load state.'; return }
    if (!state.hasRun) { pendingEl.className = 'muted'; pendingEl.textContent = 'No orchestration run yet. Run quickstart or orchestrate.'; return }
    var gates = state.manualGates || []
    if (gates.length === 0) {
      pendingEl.className = 'muted'
      pendingEl.textContent = state.status === 'completed'
        ? 'All gates passed. Nothing to approve.'
        : 'No manual gates awaiting approval right now.'
      return
    }
    pendingEl.className = ''
    pendingEl.innerHTML = gates.map(function (g) {
      return '<div class="gate-result">' +
        '<span class="badge manual">manual</span>' +
        '<div><strong>' + esc(g.gateId) + '</strong><p class="muted">stage ' + esc(g.stageId) + (g.owner ? ' · owner ' + esc(g.owner) : '') + '</p></div>' +
        '<button type="button" class="action serve-approve" data-gate="' + esc(g.gateId) + '" data-stage="' + esc(g.stageId) + '">Approve</button>' +
        '</div>'
    }).join('')
    Array.prototype.forEach.call(pendingEl.querySelectorAll('.serve-approve'), function (btn) {
      btn.addEventListener('click', function () {
        approve(btn.getAttribute('data-gate'), btn.getAttribute('data-stage'), btn)
      })
    })
  }

  function approve(gate, stage, btn) {
    var by = approverEl.value.trim()
    if (!by) { message('Enter an approver name first.', true); approverEl.focus(); return }
    btn.disabled = true
    message('Approving ' + gate + '…', false)
    fetch('api/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gate: gate, stage: stage, by: by, note: noteEl.value.trim() })
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b } }) })
      .then(function (res) {
        if (!res.ok || !res.body.ok) {
          message('Approve failed: ' + (res.body && res.body.error ? res.body.error : 'unknown error'), true)
          btn.disabled = false
          return
        }
        message('Approved ' + gate + '. Orchestrator advanced.', false)
        noteEl.value = ''
        refreshAll()
      })
      .catch(function (e) { message('Approve failed: ' + e.message, true); btn.disabled = false })
  }

  function message(text, isError) {
    msgEl.textContent = text
    msgEl.className = isError ? 'serve-error' : 'muted'
  }

  try {
    var es = new EventSource('api/events')
    es.addEventListener('state', function () { setConn('live'); refreshAll() })
    es.onopen = function () { setConn('live') }
    es.onerror = function () { setConn('reconnecting…') }
  } catch (e) {
    setConn('polling')
    setInterval(refreshAll, 3000)
  }

  refreshAll()
})()
</script>`
