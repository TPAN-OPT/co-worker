export function renderOrchestratorScript() {
  return `#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST_PATH = '.tpan-opt-co-worker/workflow.manifest.json'
const STATE_ROOT = '.tpan-opt-co-worker/orchestrations'
const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/
const SCHEMA_VERSION = 'tpan-opt-co-worker.orchestration/v1'

const options = parseArgs(process.argv.slice(2))
const manifest = readManifest()
const runId = options.runId || createDefaultRunId()
validateRunId(runId)

// Persisted agent command: the workflow can commit a default --agent-command
// (and per-role overrides) into the manifest under harnesses.orchestrator, so
// --invoke does not require retyping a command on every run. A CLI
// --agent-command still wins, then a per-owner override, then the default.
const orchestratorConfig = (manifest.harnesses && manifest.harnesses.orchestrator) || {}
const orchestratorAgents =
  orchestratorConfig.agents && typeof orchestratorConfig.agents === 'object'
    ? orchestratorConfig.agents
    : {}
const defaultAgentCommand =
  typeof orchestratorConfig.agentCommand === 'string' ? orchestratorConfig.agentCommand : ''

if (
  options.invoke &&
  !options.agentCommand &&
  !defaultAgentCommand &&
  Object.keys(orchestratorAgents).length === 0
) {
  throw new Error(
    '--invoke requires --agent-command or a persisted orchestration.agentCommand in the workflow'
  )
}

const stateDir = options.stateDir || \`\${STATE_ROOT}/\${runId}\`
const manualEvidence = options.manualEvidencePath
  ? readManualEvidence(options.manualEvidencePath)
  : { gates: {} }
const manualGateIdCounts = countManualGateIds(manifest.stages)
const startedAt = new Date().toISOString()

console.log('TPAN-OPT/CO-WORKER orchestrator')
console.log(\`Workflow: \${manifest.workflow.name}@\${manifest.workflow.version}\`)
console.log(\`Run: \${runId}\`)

// DAG-gated scheduler. Unlike the verifier, which evaluates every command gate
// globally, the orchestrator only starts a stage once all of its dependencies
// are done. Every ready stage is evaluated, so independent branches owned by
// different roles surface their work orders in parallel instead of being
// serialized behind the first incomplete stage. A stage with any unfinished
// dependency stays pending and its command gates never run — that is the
// routing + approval boundary, now expressed as the dependency graph. Because a
// stage may only depend on earlier-declared stages, the manifest array is
// already a valid topological order and a single pass resolves every stage.
// Invocations accumulate across passes so the written state and work orders
// reflect every agent the run drove, not just the final pass.
const invocations = []
const maxPasses = options.loop ? options.maxIterations : 1
let state = null
let previousDoneCount = -1

// Without --loop this runs exactly one pass (unchanged behavior). With --loop
// the pass repeats so an owner agent can take several attempts, until the run
// completes, stalls (no stage advanced), or hits the iteration cap.
for (let pass = 1; pass <= maxPasses; pass += 1) {
  if (options.loop && maxPasses > 1) {
    console.log(\`Pass \${pass}/\${maxPasses}\`)
  }

  const result = runPass()
  state = result.state

  if (!result.blocked) {
    break
  }
  // No stage advanced this pass: the remaining gates are waiting on manual
  // approval, or the agent could not satisfy a command gate. Stop instead of
  // spinning identical passes.
  if (result.doneCount === previousDoneCount) {
    break
  }
  previousDoneCount = result.doneCount
}

writeStateArtifacts(stateDir, state)
syncConsoleOrchestration(state)
console.log(\`Wrote orchestration state: \${stateDir}\`)
printSummary(state)

if (state.status !== 'completed') {
  process.exitCode = 1
}

// One scheduling pass over the DAG: every ready stage is evaluated (and, with
// --invoke, its owner agent driven once) in topological order, so a linear
// chain can cascade within a single pass. A stage with any unfinished
// dependency stays pending and its command gates never run.
function runPass() {
  const stageStates = []
  const statusById = {}

  for (const stage of manifest.stages) {
    const dependsOn = Array.isArray(stage.dependsOn) ? stage.dependsOn : []
    const blockedBy = dependsOn.filter((depId) => statusById[depId] !== 'done')

    if (blockedBy.length > 0) {
      stageStates.push(pendingStageState(stage, blockedBy))
      statusById[stage.id] = 'pending'
      continue
    }

    let evaluated = evaluateStage(stage)

    if (!evaluated.done && options.invoke) {
      const agentCommand = resolveAgentCommand(stage.owner)
      if (!agentCommand) {
        throw new Error(
          \`--invoke has no agent command for stage "\${stage.id}" (owner "\${stage.owner}"). Pass --agent-command or set orchestration.agentCommand for that role.\`
        )
      }
      invocations.push(invokeAgent(stage, evaluated.state, agentCommand))
      evaluated = evaluateStage(stage)
    }

    stageStates.push(evaluated.state)
    statusById[stage.id] = evaluated.done ? 'done' : 'current'
  }

  // Multiple stages can be "current" at once (parallel work orders across
  // owners). currentStage/workOrder stay as the first frontier for backward
  // compatibility; currentStages/workOrders carry the full set.
  const currentStages = stageStates
    .filter((stage) => stage.status === 'current')
    .map((stage) => stage.id)
  const workOrders = currentStages.map((stageId) =>
    buildWorkOrder(stageStates.find((stage) => stage.id === stageId), invocations)
  )
  const blocked = stageStates.some((stage) => stage.status !== 'done')
  const doneCount = stageStates.filter((stage) => stage.status === 'done').length

  return {
    blocked,
    doneCount,
    state: {
      schemaVersion: SCHEMA_VERSION,
      workflow: manifest.workflow,
      runId,
      status: blocked ? 'blocked' : 'completed',
      currentStage: currentStages[0] || null,
      currentStages,
      startedAt,
      finishedAt: new Date().toISOString(),
      stages: stageStates,
      invocations,
      workOrder: workOrders[0] || null,
      workOrders
    }
  }
}

function stageGates(stage) {
  const ownGates = Array.isArray(stage.gates) ? stage.gates : []
  const nodeGates = Array.isArray(stage.nodes)
    ? stage.nodes.flatMap((node) =>
        (Array.isArray(node.gates) ? node.gates : []).map((gate) => ({ ...gate, nodeId: node.id }))
      )
    : []
  return [...ownGates, ...nodeGates]
}

function asToolingArray(value) {
  return Array.isArray(value) ? value : []
}

// Resolves the tools an invoked agent is scoped to for a stage: the union of the
// stage's own skills/mcpServers/hooks and every sub-node's, plus a per-node
// breakdown so an agent that owns a single node sees only its slice. This is what
// turns the declared (and previously inert) per-node tooling into something the
// orchestrator hands to the agent at invoke time, via the brief and env vars.
function collectStageTooling(stage) {
  const nodeScopes = (Array.isArray(stage.nodes) ? stage.nodes : []).map((node) => ({
    id: node.id,
    output: node.output || '',
    skills: asToolingArray(node.skills),
    mcpServers: asToolingArray(node.mcpServers),
    hooks: asToolingArray(node.hooks)
  }))
  const union = (key) => [
    ...new Set([...asToolingArray(stage[key]), ...nodeScopes.flatMap((node) => node[key])])
  ]
  return {
    skills: union('skills'),
    mcpServers: union('mcpServers'),
    hooks: union('hooks'),
    nodes: nodeScopes
  }
}

function evaluateStage(stage) {
  const gates = []
  let commandBlocked = false

  for (const gate of stageGates(stage)) {
    if (gate.type === 'command') {
      if (commandBlocked) {
        gates.push({ id: gate.id, type: 'command', status: 'skipped', exitCode: null })
        continue
      }

      const result = runCommandGate(stage.id, gate)
      gates.push(result)
      if (result.status !== 'passed') {
        commandBlocked = true
      }
      continue
    }

    gates.push(evaluateManualGate(stage.id, gate))
  }

  const done = gates.every((gate) => gate.status === 'passed')
  return {
    done,
    state: {
      id: stage.id,
      owner: stage.owner,
      output: stage.output || '',
      dependsOn: Array.isArray(stage.dependsOn) ? stage.dependsOn : [],
      status: done ? 'done' : 'current',
      gates
    }
  }
}

function pendingStageState(stage, blockedBy = []) {
  return {
    id: stage.id,
    owner: stage.owner,
    output: stage.output || '',
    dependsOn: Array.isArray(stage.dependsOn) ? stage.dependsOn : [],
    status: 'pending',
    blockedBy,
    gates: stageGates(stage).map((gate) => ({
      id: gate.id,
      type: gate.type,
      status: 'not_started',
      exitCode: gate.type === 'command' ? null : undefined
    }))
  }
}

function runCommandGate(stageId, gate) {
  const command = gate.command || ''
  if (!command) {
    return { id: gate.id, type: 'command', status: 'failed', exitCode: 1, error: 'missing command' }
  }

  console.log(\`command:\${gate.id} [\${stageId}] \${command}\`)
  const result = spawnSync(command, { shell: true, stdio: 'inherit' })

  if (result.error) {
    return { id: gate.id, type: 'command', status: 'failed', exitCode: 1, command, error: result.error.message }
  }

  if (result.status !== 0) {
    return { id: gate.id, type: 'command', status: 'failed', exitCode: result.status || 1, command }
  }

  return { id: gate.id, type: 'command', status: 'passed', exitCode: 0, command }
}

function resolveAgentCommand(owner) {
  if (options.agentCommand) {
    return options.agentCommand
  }

  const perRole = orchestratorAgents[owner]
  if (typeof perRole === 'string' && perRole !== '') {
    return perRole
  }

  return defaultAgentCommand
}

function invokeAgent(stage, stageState, agentCommand) {
  const workOrder = buildWorkOrder(stageState)
  const briefPath = writeBrief(stage.id, workOrder)
  const tooling = collectStageTooling(stage)
  const command = renderAgentCommand(agentCommand, {
    stage: stage.id,
    role: stage.owner,
    brief: briefPath,
    skills: tooling.skills.join(','),
    mcpServers: tooling.mcpServers.join(','),
    hooks: tooling.hooks.join(',')
  })
  const invokedAt = new Date().toISOString()
  console.log(\`invoke:\${stage.owner} [\${stage.id}] \${command}\`)
  const result = spawnSync(command, {
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      TPAN_OPT_STAGE: stage.id,
      TPAN_OPT_ROLE: stage.owner,
      TPAN_OPT_BRIEF: briefPath,
      TPAN_OPT_SKILLS: tooling.skills.join(','),
      TPAN_OPT_MCP_SERVERS: tooling.mcpServers.join(','),
      TPAN_OPT_HOOKS: tooling.hooks.join(',')
    }
  })

  const status = result.error ? 'error' : result.status === 0 ? 'completed' : 'failed'
  const invocation = {
    stageId: stage.id,
    role: stage.owner,
    command,
    status,
    exitCode: result.error ? 1 : result.status || 0,
    brief: relative(PROJECT_ROOT, briefPath),
    startedAt: invokedAt,
    finishedAt: new Date().toISOString(),
    ...(result.error ? { error: result.error.message } : {})
  }

  writeJson(resolve(projectPath(stateDir), \`invocation-\${stage.id}.json\`), invocation)
  return invocation
}

function writeBrief(stageId, workOrder) {
  const dir = projectPath(stateDir)
  mkdirSync(dir, { recursive: true })
  const briefPath = resolve(dir, \`brief-\${stageId}.json\`)
  writeJson(briefPath, { workflow: manifest.workflow, ...workOrder })
  return briefPath
}

function renderAgentCommand(template, values) {
  return template.replace(/\\{(stage|role|brief|skills|mcpServers|hooks)\\}/g, (match, key) =>
    values[key] === undefined ? match : values[key]
  )
}

function writeJson(path, value) {
  writeFileSync(path, \`\${JSON.stringify(value, null, 2)}\\n\`, 'utf8')
}

function evaluateManualGate(stageId, gate) {
  const evidence = findManualEvidence(stageId, gate)
  if (!evidence || !hasAuditableApproval(evidence)) {
    return { id: gate.id, type: 'manual', status: 'pending', description: gate.description || '' }
  }

  return { id: gate.id, type: 'manual', status: 'passed', description: gate.description || '', evidence }
}

function findManualEvidence(stageId, gate) {
  const scopedGateId = \`\${stageId}.\${gate.id}\`
  if (Object.prototype.hasOwnProperty.call(manualEvidence.gates, scopedGateId)) {
    return manualEvidence.gates[scopedGateId]
  }

  if (
    manualGateIdCounts[gate.id] === 1 &&
    Object.prototype.hasOwnProperty.call(manualEvidence.gates, gate.id)
  ) {
    return manualEvidence.gates[gate.id]
  }

  return null
}

function hasAuditableApproval(evidence) {
  return (
    evidence !== null &&
    typeof evidence === 'object' &&
    !Array.isArray(evidence) &&
    typeof evidence.approvedBy === 'string' &&
    evidence.approvedBy.trim() !== ''
  )
}

function buildWorkOrder(stageState, invocationLog = []) {
  const role = manifest.roles[stageState.owner] || {}
  const stage = manifest.stages.find((item) => item.id === stageState.id) || {}
  const pendingGates = stageState.gates
    .filter((gate) => gate.status !== 'passed')
    .map((gate) => ({
      id: gate.id,
      type: gate.type,
      status: gate.status,
      reason:
        gate.type === 'command'
          ? \`Run and pass: \${gate.command || gate.id}\`
          : 'Attach approval evidence with a non-empty "approvedBy" field.'
    }))
  const invocation =
    invocationLog.filter((item) => item.stageId === stageState.id).pop() || null
  const tooling = collectStageTooling(stage)

  return {
    stageId: stageState.id,
    owner: stageState.owner,
    output: stageState.output,
    role: {
      description: role.description || '',
      skills: role.skills || [],
      permissions: role.permissions || []
    },
    required: stage.required || [],
    tooling: {
      skills: tooling.skills,
      mcpServers: tooling.mcpServers,
      hooks: tooling.hooks
    },
    nodes: tooling.nodes,
    agents: collectAgentFiles(stageState.owner),
    pendingGates,
    invocation,
    nextAction: describeNextAction(pendingGates)
  }
}

function collectAgentFiles(owner) {
  const harnesses = manifest.harnesses || {}
  return {
    codex: harnesses.codex?.agents?.[owner] || null,
    claudeCode: harnesses.claudeCode?.agents?.[owner] || null,
    openCode: harnesses.openCode?.agents?.[owner] || null,
    cursor: harnesses.cursor?.rules || []
  }
}

function describeNextAction(pendingGates) {
  if (pendingGates.length === 0) {
    return 'Stage owner has no remaining gates; re-run to advance.'
  }

  const commands = pendingGates.filter((gate) => gate.type === 'command').map((gate) => gate.id)
  const manuals = pendingGates.filter((gate) => gate.type === 'manual').map((gate) => gate.id)
  const parts = []
  if (commands.length > 0) {
    parts.push(\`Fix and re-run command gate(s): \${commands.join(', ')}.\`)
  }
  if (manuals.length > 0) {
    parts.push(\`Attach approval evidence for manual gate(s): \${manuals.join(', ')}.\`)
  }

  return parts.join(' ')
}

function writeStateArtifacts(dir, value) {
  const resolvedDir = projectPath(dir)
  mkdirSync(resolvedDir, { recursive: true })
  writeFileSync(resolve(resolvedDir, 'state.json'), \`\${JSON.stringify(value, null, 2)}\\n\`, 'utf8')
  writeFileSync(resolve(resolvedDir, 'state.md'), renderStateMarkdown(value), 'utf8')
}

// Mirror the latest orchestration state into the static console so the
// Orchestration panel can render stage progress, the open work order, and
// agent invocations without a server, matching how the local runner mirrors
// run history into runs.json / runs.js.
function syncConsoleOrchestration(value) {
  const consoleDir = projectPath('.tpan-opt-co-worker/console')
  mkdirSync(consoleDir, { recursive: true })
  const payload = JSON.stringify({ current: value }, null, 2)
  writeFileSync(resolve(consoleDir, 'orchestration.json'), \`\${payload}\\n\`, 'utf8')
  writeFileSync(
    resolve(consoleDir, 'orchestration.js'),
    \`window.TPAN_OPT_ORCHESTRATION = \${payload}\\n\`,
    'utf8'
  )
}

function renderStateMarkdown(value) {
  const stageRows = value.stages
    .map(
      (stage) =>
        \`| \${stage.id} | \${stage.owner} | \${stage.status} | \${formatInlineList(stage.dependsOn || [])} |\`
    )
    .join('\\n')

  const invocationRows = (value.invocations || [])
    .map((item) => \`| \${item.stageId} | \${item.role} | \${item.status} | \${item.exitCode} |\`)
    .join('\\n')

  const workOrders = value.workOrders || (value.workOrder ? [value.workOrder] : [])
  const workOrderSection =
    workOrders.length > 0
      ? workOrders.map(renderWorkOrderMarkdown).join('\\n')
      : 'All stages complete. No open work order.\\n'

  return \`# TPAN-OPT/CO-WORKER Orchestration State

- Workflow: \${value.workflow.name}@\${value.workflow.version}
- Run: \${value.runId}
- Status: \${value.status}
- Current stages: \${formatInlineList(value.currentStages || (value.currentStage ? [value.currentStage] : []))}
- startedAt: \${value.startedAt}
- finishedAt: \${value.finishedAt}

## Stages

| Stage | Owner | Status | Depends on |
| --- | --- | --- | --- |
\${stageRows || '| - | - | none | - |'}

## Agent Invocations

| Stage | Role | Status | Exit |
| --- | --- | --- | --- |
\${invocationRows || '| - | - | none | - |'}

## Work Orders

\${workOrderSection}\`
}

function renderWorkOrderMarkdown(workOrder) {
  const gateRows = workOrder.pendingGates
    .map((gate) => \`| \${gate.id} | \${gate.type} | \${gate.status} | \${gate.reason} |\`)
    .join('\\n')

  return \`### Work order: \${workOrder.stageId}

- Stage: \\\`\${workOrder.stageId}\\\`
- Owner: \\\`\${workOrder.owner}\\\`
- Output: \${workOrder.output ? \`\\\`\${workOrder.output}\\\`\` : 'none'}
- Skills: \${formatInlineList(workOrder.role.skills)}
- Permissions: \${formatInlineList(workOrder.role.permissions)}
- Required work: \${formatInlineList(workOrder.required)}
- Codex agent: \${workOrder.agents.codex || 'none'}
- Claude Code agent: \${workOrder.agents.claudeCode || 'none'}
- OpenCode agent: \${workOrder.agents.openCode || 'none'}

### Pending Gates

| Gate | Type | Status | Next |
| --- | --- | --- | --- |
\${gateRows || '| - | - | none | - |'}

### Next Action

\${workOrder.nextAction}
\`
}

function printSummary(value) {
  for (const stage of value.stages) {
    console.log(\`\${stage.status.toUpperCase().padEnd(9)} \${stage.id} [\${stage.owner}]\`)
  }
  if (value.invocations && value.invocations.length > 0) {
    console.log(\`Agent invocations: \${value.invocations.length}\`)
  }
  const workOrders = value.workOrders || (value.workOrder ? [value.workOrder] : [])
  if (workOrders.length > 0) {
    console.log(\`Open work orders: \${workOrders.length}\`)
    for (const workOrder of workOrders) {
      console.log(\`Next [\${workOrder.stageId}]: \${workOrder.nextAction}\`)
    }
  } else {
    console.log('All stages complete.')
  }
}

function formatInlineList(items) {
  return !items || items.length === 0 ? 'none' : items.map((item) => \`\\\`\${item}\\\`\`).join(', ')
}

function readManifest() {
  const rawContent = readFileSync(projectPath(MANIFEST_PATH), 'utf8')
  const parsed = JSON.parse(rawContent)

  if (!parsed.workflow || !parsed.workflow.name || !parsed.workflow.version) {
    throw new Error(\`\${MANIFEST_PATH} must include workflow name and version\`)
  }

  if (!Array.isArray(parsed.stages) || parsed.stages.length === 0) {
    throw new Error(\`\${MANIFEST_PATH} must include a non-empty stages array\`)
  }

  return parsed
}

function readManualEvidence(manualEvidencePath) {
  const parsed = JSON.parse(readFileSync(manualEvidencePath, 'utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--manual-evidence must point to a JSON object')
  }

  const gates = parsed.gates
  if (!gates || typeof gates !== 'object' || Array.isArray(gates)) {
    throw new Error('--manual-evidence JSON must include a gates object')
  }

  return { gates }
}

function countManualGateIds(stages) {
  const counts = {}
  for (const stage of stages) {
    for (const gate of stage.gates || []) {
      if (gate.type === 'manual') {
        counts[gate.id] = (counts[gate.id] || 0) + 1
      }
    }
  }
  return counts
}

function validateRunId(value) {
  if (!RUN_ID_PATTERN.test(value)) {
    throw new Error('--run-id may only contain letters, numbers, dots, underscores, and hyphens')
  }

  if (value === '.' || value === '..') {
    throw new Error('--run-id may not be "." or ".."')
  }
}

function createDefaultRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function parseArgs(args) {
  const parsed = { runId: '', manualEvidencePath: '', stateDir: '', invoke: false, agentCommand: '', loop: false, maxIterations: 25 }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--run-id') {
      parsed.runId = requireNextValue(args, index, '--run-id')
      index += 1
      continue
    }

    if (arg === '--manual-evidence') {
      parsed.manualEvidencePath = resolve(requireNextValue(args, index, '--manual-evidence'))
      index += 1
      continue
    }

    if (arg === '--state-dir') {
      parsed.stateDir = requireNextValue(args, index, '--state-dir')
      index += 1
      continue
    }

    if (arg === '--invoke') {
      parsed.invoke = true
      continue
    }

    if (arg === '--loop') {
      parsed.loop = true
      continue
    }

    if (arg === '--max-iterations') {
      const value = requireNextValue(args, index, '--max-iterations')
      const count = Number.parseInt(value, 10)
      if (!Number.isInteger(count) || count < 1) {
        throw new Error('--max-iterations requires a positive integer')
      }
      parsed.maxIterations = count
      index += 1
      continue
    }

    if (arg === '--agent-command') {
      parsed.agentCommand = requireNextValue(args, index, '--agent-command')
      index += 1
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }

    throw new Error(\`Unknown option "\${arg}"\`)
  }

  return parsed
}

function requireNextValue(args, index, label) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(\`\${label} requires a value\`)
  }

  return value
}

function projectPath(...segments) {
  return resolve(PROJECT_ROOT, ...segments)
}

function printHelp() {
  console.log('Usage: node scripts/orchestrate-workflow.mjs [--run-id local] [--manual-evidence manual-evidence.json] [--state-dir .tpan-opt-co-worker/orchestrations/<id>] [--invoke [--agent-command "<cmd with {stage} {role} {brief} {skills} {mcpServers} {hooks}>"]] [--loop [--max-iterations 25]]')
  console.log('Agent-command placeholders {skills} {mcpServers} {hooks} (and env TPAN_OPT_SKILLS / TPAN_OPT_MCP_SERVERS / TPAN_OPT_HOOKS) carry the stage+node tool scope; the brief JSON also lists tooling and a per-node breakdown.')
  console.log('When the workflow persists orchestration.agentCommand (or per-role orchestration.agents), --invoke can omit --agent-command and the persisted command is used; --agent-command overrides it.')
  console.log('--loop repeats the scheduling pass (default --invoke driving) until the run completes, stalls with no stage advancing (for example a pending manual gate), or reaches --max-iterations.')
}
`
}
