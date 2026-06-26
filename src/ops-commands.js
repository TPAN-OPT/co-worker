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

export async function readOrchestrationState(out) {
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

export async function nextWorkOrder(out) {
  const state = await readOrchestrationState(out)
  if (!state) {
    return {
      hasRun: false,
      text: 'No orchestration run recorded yet. Run `tpan-opt-co-worker quickstart` or orchestrate first.'
    }
  }
  return { hasRun: true, state, text: renderOrchestrationSummary(state) }
}

export async function workflowStatus(out) {
  const manifest = await readManifest(out)
  const state = await readOrchestrationState(out)
  const stageStatus = {}
  if (state && Array.isArray(state.stages)) {
    for (const stage of state.stages) {
      stageStatus[stage.id] = stage.status
    }
  }

  const lines = [
    `Workflow: ${manifest.workflow.name}@${manifest.workflow.version}`,
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
  const options = parseOpsArgs(args, 'status')
  const result = await workflowStatus(options.out)
  console.log(result.text)
}

export async function runNext(args) {
  const options = parseOpsArgs(args, 'next')
  const result = await nextWorkOrder(options.out)
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

function parseOpsArgs(args, name) {
  const options = { out: '.' }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--out') {
      options.out = requireNextValue(args, index, '--out')
      index += 1
      continue
    }

    if (arg === '--help' || arg === '-h') {
      console.log(`Usage:\n  tpan-opt-co-worker ${name} [--out .]`)
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
