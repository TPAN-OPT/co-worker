import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

// First-class runtime commands for a compiled repository: inspect status, see
// the next open work order, and approve a manual gate. The core functions are
// shared with the MCP server's co_worker_next / co_worker_approve tools so the
// CLI and the in-agent tools behave identically.
const MANIFEST_REL = '.tpan-opt-co-worker/workflow.manifest.json'
const ORCHESTRATION_REL = '.tpan-opt-co-worker/console/orchestration.json'
const EVIDENCE_REL = '.tpan-opt-co-worker/manual-evidence.json'
const RUNS_INDEX_REL = '.tpan-opt-co-worker/runs/index.json'

function runStatePath(runId) {
  return `.tpan-opt-co-worker/orchestrations/${runId}/state.json`
}

// Without a run id, read the console mirror, which always reflects the latest
// run (`data.current`). With a run id, read that specific run's state file
// directly — its shape is the same state object the mirror stores under
// `current`, so the renderers work unchanged.
export async function readOrchestrationState(out, runId = '') {
  if (runId) {
    try {
      return JSON.parse(await readFile(resolve(out, runStatePath(runId)), 'utf8'))
    } catch {
      return null
    }
  }

  try {
    const data = JSON.parse(await readFile(resolve(out, ORCHESTRATION_REL), 'utf8'))
    return data && typeof data === 'object' ? data.current : null
  } catch {
    return null
  }
}

export function renderOrchestrationSummary(state) {
  const workOrders = state.workOrders || (state.workOrder ? [state.workOrder] : [])
  const currentStages = state.currentStages || (state.currentStage ? [state.currentStage] : [])
  const lines = [
    `Status: ${state.status}`,
    `Current stages: ${currentStages.length ? currentStages.join(', ') : 'none'}`
  ]
  if (workOrders.length > 0) {
    for (const order of workOrders) {
      lines.push(`- [${order.stageId}] owner ${order.owner}: ${order.nextAction}`)
    }
  } else {
    lines.push('All stages complete.')
  }
  return lines.join('\n')
}

export async function nextWorkOrder(out, runId = '') {
  const state = await readOrchestrationState(out, runId)
  if (!state) {
    const scope = runId ? ` for run "${runId}"` : ''
    return {
      hasRun: false,
      text: `No orchestration run recorded yet${scope}. Run \`tpan-opt-co-worker quickstart\` or orchestrate first.`
    }
  }
  return { hasRun: true, state, text: renderOrchestrationSummary(state) }
}

export async function workflowStatus(out, runId = '') {
  const manifest = await readManifest(out)
  const state = await readOrchestrationState(out, runId)
  const stageStatus = {}
  if (state && Array.isArray(state.stages)) {
    for (const stage of state.stages) {
      stageStatus[stage.id] = stage.status
    }
  }

  const mode = manifest.mode || 'opt'
  const modeLabel = mode === 'team' ? 'team (human teammates)' : 'opt (code agents)'
  const lines = [
    `Workflow: ${manifest.workflow.name}@${manifest.workflow.version}`,
    `Mode: ${modeLabel}`,
    ...(mode === 'team' ? ['Playbook: PLAYBOOK.md (hand to each teammate; one run per product/module)'] : []),
    `Orchestration: ${state ? state.status : 'not run yet'}`,
    'Stages:'
  ]
  for (const stage of manifest.stages) {
    const status = stageStatus[stage.id] || 'not started'
    lines.push(`  ${status.padEnd(11)} ${stage.id} [${stage.owner}]`)
  }
  if (state) {
    const currentStages = state.currentStages || (state.currentStage ? [state.currentStage] : [])
    lines.push(`Current: ${currentStages.length ? currentStages.join(', ') : 'none'}`)
  } else {
    lines.push('Run `tpan-opt-co-worker quickstart` or orchestrate to populate orchestration state.')
  }
  return { manifest, state, text: lines.join('\n') }
}

// Team-mode shared dashboard: in team mode every teammate runs the WHOLE
// pipeline on their own product/module, recorded as a labelled verification run
// (`run-workflow.mjs --module <name>`). This aggregates the latest run per module
// into one side-by-side table so a lead can see who is green at a glance. It is a
// read-only view over the same runs index the web console renders.
export async function readRunsIndex(out) {
  try {
    const parsed = JSON.parse(await readFile(resolve(out, RUNS_INDEX_REL), 'utf8'))
    return parsed && Array.isArray(parsed.runs) ? parsed.runs : []
  } catch {
    return []
  }
}

export function latestRunPerModule(runs) {
  const byModule = new Map()
  for (const run of runs) {
    const label = run.module || '(unlabeled)'
    const current = byModule.get(label)
    if (!current || String(run.finishedAt || '') > String(current.finishedAt || '')) {
      byModule.set(label, run)
    }
  }
  return [...byModule.entries()]
    .map(([module, run]) => ({ module, run }))
    .sort((a, b) => a.module.localeCompare(b.module))
}

export async function workflowDashboard(out) {
  const manifest = await readManifest(out)
  const runs = await readRunsIndex(out)
  const mode = manifest.mode || 'opt'
  const modeLabel = mode === 'team' ? 'team (human teammates)' : 'opt (code agents)'
  const grouped = latestRunPerModule(runs)

  const lines = [
    `Workflow: ${manifest.workflow.name}@${manifest.workflow.version}`,
    `Mode: ${modeLabel}`,
    `Runs: ${runs.length} across ${grouped.length} module${grouped.length === 1 ? '' : 's'}`
  ]

  if (grouped.length === 0) {
    lines.push('No runs recorded yet. Run `node scripts/run-workflow.mjs --module <name>` per product/module.')
    return { manifest, runs, grouped, text: lines.join('\n') }
  }

  lines.push('')
  lines.push(formatDashboardRow('Module', 'Latest run', 'Status', 'Command', 'Gates', 'Finished'))
  for (const { module, run } of grouped) {
    lines.push(
      formatDashboardRow(
        module,
        run.id || '-',
        run.status || 'unknown',
        run.commandPassed ? 'pass' : 'fail',
        run.allGatesPassed ? 'pass' : 'fail',
        run.finishedAt || '-'
      )
    )
  }
  return { manifest, runs, grouped, text: lines.join('\n') }
}

function formatDashboardRow(module, runId, status, command, gates, finished) {
  return [
    String(module).padEnd(18),
    String(runId).padEnd(22),
    String(status).padEnd(8),
    String(command).padEnd(8),
    String(gates).padEnd(6),
    String(finished)
  ].join(' ')
}

export async function approveGate({ out, gate, stage = '', approvedBy, note = '', runId = 'local' }) {
  const targetDir = resolve(out)
  const evidencePath = resolve(targetDir, EVIDENCE_REL)
  const evidence = await readEvidence(evidencePath)
  const key = stage ? `${stage}.${gate}` : gate
  evidence.gates[key] = {
    approvedBy,
    ...(note ? { note } : {})
  }

  await mkdir(dirname(evidencePath), { recursive: true })
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')

  const run = spawnSync(
    process.execPath,
    [resolve(targetDir, 'scripts', 'orchestrate-workflow.mjs'), '--run-id', runId, '--manual-evidence', evidencePath],
    { cwd: targetDir, encoding: 'utf8' }
  )

  if (run.error) {
    return {
      key,
      advanced: false,
      text: `Recorded approval for ${key} by ${approvedBy}, but could not advance the orchestrator (${run.error.message}). Run it manually: node scripts/orchestrate-workflow.mjs --run-id ${runId} --manual-evidence ${EVIDENCE_REL}`
    }
  }

  const state = await readOrchestrationState(out)
  const summary = state ? `\n${renderOrchestrationSummary(state)}` : ''
  return { key, advanced: true, state, text: `Recorded approval for ${key} by ${approvedBy}.${summary}` }
}

export async function runStatus(args) {
  const options = parseOpsArgs(args, 'status', { allowRunId: true })
  const result = await workflowStatus(options.out, options.runId)
  console.log(result.text)
}

export async function runNext(args) {
  const options = parseOpsArgs(args, 'next', { allowRunId: true })
  const result = await nextWorkOrder(options.out, options.runId)
  console.log(result.text)
}

export async function runDashboard(args) {
  const options = parseOpsArgs(args, 'dashboard')
  const result = await workflowDashboard(options.out)
  console.log(result.text)
}

export async function runApprove(args) {
  const options = parseApproveArgs(args)
  const result = await approveGate(options)
  console.log(result.text)
}

async function readManifest(out) {
  try {
    return JSON.parse(await readFile(resolve(out, MANIFEST_REL), 'utf8'))
  } catch {
    throw new Error(
      `No compiled workflow found in ${resolve(out)}. Run \`tpan-opt-co-worker quickstart\` or \`compile\` first.`
    )
  }
}

async function readEvidence(evidencePath) {
  try {
    const parsed = JSON.parse(await readFile(evidencePath, 'utf8'))
    if (parsed && typeof parsed === 'object' && parsed.gates && typeof parsed.gates === 'object') {
      return parsed
    }
  } catch {
    // No evidence file yet, or unreadable; start fresh.
  }
  return { gates: {} }
}

function parseOpsArgs(args, name, { allowRunId = false } = {}) {
  const options = { out: '.', runId: '' }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--out') {
      options.out = requireNextValue(args, index, '--out')
      index += 1
      continue
    }

    if (allowRunId && arg === '--run-id') {
      options.runId = requireNextValue(args, index, '--run-id')
      index += 1
      continue
    }

    if (arg === '--help' || arg === '-h') {
      const runIdUsage = allowRunId ? ' [--run-id <id>]' : ''
      console.log(`Usage:\n  tpan-opt-co-worker ${name} [--out .]${runIdUsage}`)
      process.exit(0)
    }

    throw new Error(`Unknown ${name} option "${arg}"`)
  }

  return options
}

function parseApproveArgs(args) {
  const options = { out: '.', gate: '', stage: '', approvedBy: '', note: '', runId: 'local' }
  const positionals = []

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--out') {
      options.out = requireNextValue(args, index, '--out')
      index += 1
      continue
    }

    if (arg === '--gate') {
      options.gate = requireNextValue(args, index, '--gate')
      index += 1
      continue
    }

    if (arg === '--stage') {
      options.stage = requireNextValue(args, index, '--stage')
      index += 1
      continue
    }

    if (arg === '--by' || arg === '--approved-by') {
      options.approvedBy = requireNextValue(args, index, '--by')
      index += 1
      continue
    }

    if (arg === '--note') {
      options.note = requireNextValue(args, index, '--note')
      index += 1
      continue
    }

    if (arg === '--run-id') {
      options.runId = requireNextValue(args, index, '--run-id')
      index += 1
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printApproveHelp()
      process.exit(0)
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown approve option "${arg}"`)
    }

    positionals.push(arg)
  }

  if (!options.gate) {
    options.gate = positionals[0] || ''
  }
  if (!options.gate) {
    throw new Error('approve requires a gate id (positional or --gate <id>)')
  }
  if (!options.approvedBy) {
    throw new Error('approve requires --by <approver>')
  }

  return options
}

function printApproveHelp() {
  console.log(`Usage:
  tpan-opt-co-worker approve <gate> --by <approver> [--stage <stage>] [--note <text>] [--out .] [--run-id local]

Records approver evidence for a manual gate, then advances the orchestrator and
prints the new status. Pass --stage when the gate id is reused across stages.`)
}

function requireNextValue(args, index, name) {
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }

  return value
}
