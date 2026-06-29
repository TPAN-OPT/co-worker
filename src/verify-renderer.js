import { stageGates } from './stage-gates.js'

export function renderVerifyScript(workflow) {
  const workflowStages = workflow.stages.map((stage) => ({
    id: stage.id,
    commandGates: getStageGates(stage, 'command'),
    manualGates: getStageGates(stage, 'manual')
  }))
  const commandGates = workflow.stages.flatMap((stage) => getStageGates(stage, 'command'))
  const manualGates = workflow.stages.flatMap((stage) => getStageGates(stage, 'manual'))

  return `#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const workflow = {
  name: ${JSON.stringify(workflow.name)},
  version: ${JSON.stringify(workflow.version)}
}

const commandGates = ${JSON.stringify(commandGates, null, 2)}
const manualGates = ${JSON.stringify(manualGates, null, 2)}
const workflowStages = ${JSON.stringify(workflowStages, null, 2)}
const options = parseArgs(process.argv.slice(2))
const startedAt = new Date().toISOString()
const commandGateResults = []
const manualGateResults = []
const manualEvidence = options.manualEvidencePath
  ? readManualEvidence(options.manualEvidencePath)
  : { gates: {} }
const manualGateIdCounts = countManualGateIds(manualGates)

console.log(\`TPAN-OPT/CO-WORKER workflow: \${workflow.name}@\${workflow.version}\`)

// Command gates run independently of manual gates so that automated checks
// (tests, coverage, lint) always execute in CI, where manual approvals are
// not attached. A failed command gate still fail-fasts subsequent command
// gates, but a pending manual gate never blocks command execution. Manual
// gates only affect the final allGatesPassed verdict.
let commandBlockedBy = ''

for (const stage of workflowStages) {
  for (const gate of stage.commandGates) {
    if (commandBlockedBy) {
      commandGateResults.push(skipCommandGate(gate, commandBlockedBy))
      continue
    }

    const result = runCommandGate(gate)
    commandGateResults.push(result)
    if (result.status === 'failed') {
      commandBlockedBy = getGateRef(gate)
    }
  }
}

for (const stage of workflowStages) {
  for (const gate of stage.manualGates) {
    const result = evaluateManualGate(gate)
    manualGateResults.push(result)
    printManualGate(gate)
  }
}

if (manualGates.length > 0) {
  console.log('Attach manual approval or evidence for every listed manual gate before release.')
}

const report = buildReport({
  workflow,
  startedAt,
  commandGateResults,
  manualGateResults
})

if (options.runDir) {
  writeRunArtifacts(options.runDir, report)
  console.log(\`Wrote run artifacts: \${options.runDir}\`)
}

if (options.reportPath) {
  writeJsonFile(options.reportPath, report)
  console.log(\`Wrote evidence report: \${options.reportPath}\`)
}

if (!report.allGatesPassed) {
  console.error('Workflow verification requires every command and manual gate to pass.')
  process.exitCode = process.exitCode || 1
}

function runCommandGate(gate) {
  console.log(\`command:\${gate.id} [\${gate.stageId}] \${gate.command}\`)
  const result = spawnSync(gate.command, {
    shell: true,
    stdio: 'inherit'
  })

  if (result.error) {
    console.error(\`Command gate failed: \${gate.id}\`)
    console.error(result.error.message)
    process.exitCode = 1
    return {
      ...gate,
      status: 'failed',
      exitCode: 1,
      error: result.error.message
    }
  }

  if (result.status !== 0) {
    console.error(\`Command gate failed: \${gate.id}\`)
    process.exitCode = result.status || 1
    return {
      ...gate,
      status: 'failed',
      exitCode: result.status || 1
    }
  }

  console.log(\`PASS command:\${gate.id}\`)
  return {
    ...gate,
    status: 'passed',
    exitCode: 0
  }
}

function skipCommandGate(gate, blockedByGate) {
  return {
    ...gate,
    status: 'skipped',
    exitCode: null,
    blockedBy: blockedByGate
  }
}

function evaluateManualGate(gate) {
  const evidence = findManualEvidence(gate)
  if (!evidence) {
    return {
      ...gate,
      status: 'pending'
    }
  }

  if (!hasAuditableApproval(evidence)) {
    console.error(
      \`Manual gate \${getGateRef(gate)} evidence is missing a non-empty "approvedBy" field; treating it as pending.\`
    )
    return {
      ...gate,
      status: 'pending',
      evidence
    }
  }

  return {
    ...gate,
    status: 'passed',
    evidence
  }
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

function findManualEvidence(gate) {
  const scopedGateId = getGateRef(gate)
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

function printManualGate(gate) {
  const suffix = gate.description ? \` - \${gate.description}\` : ''
  console.log(\`manual:\${gate.id} [\${gate.stageId}]\${suffix}\`)
}

function getGateRef(gate) {
  return \`\${gate.stageId}.\${gate.id}\`
}

function countManualGateIds(gates) {
  return gates.reduce((counts, gate) => ({
    ...counts,
    [gate.id]: (counts[gate.id] || 0) + 1
  }), {})
}

function parseArgs(args) {
  const parsed = {
    reportPath: '',
    manualEvidencePath: '',
    runDir: ''
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--report') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('--report requires a path')
      }
      parsed.reportPath = resolve(value)
      index += 1
      continue
    }

    if (arg === '--manual-evidence') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('--manual-evidence requires a path')
      }
      parsed.manualEvidencePath = resolve(value)
      index += 1
      continue
    }

    if (arg === '--run-dir') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('--run-dir requires a path')
      }
      parsed.runDir = resolve(value)
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

function buildReport({ workflow, startedAt, commandGateResults, manualGateResults }) {
  const commandPassed = commandGateResults.every((gate) => gate.status === 'passed')
  const allGatesPassed =
    commandPassed && manualGateResults.every((gate) => gate.status === 'passed')

  return {
    workflow,
    passed: allGatesPassed,
    commandPassed,
    allGatesPassed,
    startedAt,
    finishedAt: new Date().toISOString(),
    commandGates: commandGateResults,
    manualGates: manualGateResults
  }
}

function writeRunArtifacts(runDir, report) {
  mkdirSync(runDir, { recursive: true })
  writeJsonFile(resolve(runDir, 'evidence.json'), report)
  writeFileSync(resolve(runDir, 'summary.md'), renderSummary(report), 'utf8')
}

function writeJsonFile(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, \`\${JSON.stringify(value, null, 2)}\\n\`, 'utf8')
}

function renderSummary(report) {
  const commandRows = report.commandGates
    .map((gate) => \`| \${gate.stageId} | \${gate.id} | \${gate.status} | \${gate.exitCode} |\`)
    .join('\\n')
  const manualRows = report.manualGates
    .map((gate) => \`| \${gate.stageId} | \${gate.id} | \${gate.status} |\`)
    .join('\\n')

  return \`# TPAN-OPT/CO-WORKER Evidence Summary

- Workflow: \${report.workflow.name}@\${report.workflow.version}
- commandPassed: \${report.commandPassed}
- allGatesPassed: \${report.allGatesPassed}
- startedAt: \${report.startedAt}
- finishedAt: \${report.finishedAt}

## Command Gates

| Stage | Gate | Status | Exit Code |
| --- | --- | --- | --- |
\${commandRows || '| - | - | none | - |'}

## Manual Gates

| Stage | Gate | Status |
| --- | --- | --- |
\${manualRows || '| - | - | none |'}
\`
}

function readManualEvidence(manualEvidencePath) {
  const rawContent = readFileSync(manualEvidencePath, 'utf8')
  const parsed = JSON.parse(rawContent)

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--manual-evidence must point to a JSON object')
  }

  const gates = parsed.gates
  if (!gates || typeof gates !== 'object' || Array.isArray(gates)) {
    throw new Error('--manual-evidence JSON must include a gates object')
  }

  return {
    gates
  }
}

function printHelp() {
  console.log('Usage: node scripts/verify-workflow.mjs [--manual-evidence manual-evidence.json] [--report evidence.json] [--run-dir .tpan-opt-co-worker/runs/<id>]')
}
`
}

function getStageGates(stage, type) {
  return stageGates(stage)
    .filter((gate) => gate.type === type)
    .map((gate) => ({
      stageId: stage.id,
      ...(gate.nodeId ? { nodeId: gate.nodeId } : {}),
      id: gate.id,
      preset: gate.preset || '',
      ...(type === 'command' ? { command: gate.command } : {}),
      description: gate.description
    }))
}
