export function renderLocalRunnerScript() {
  return `#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const MANIFEST_PATH = '.tpan-opt-co-worker/workflow.manifest.json'
const RUNS_ROOT = '.tpan-opt-co-worker/runs'
const RUN_INDEX_PATH = '.tpan-opt-co-worker/runs/index.json'
const CONSOLE_RUNS_PATH = '.tpan-opt-co-worker/console/runs.json'
const CONSOLE_RUNS_SCRIPT_PATH = '.tpan-opt-co-worker/console/runs.js'
const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/

const options = parseArgs(process.argv.slice(2))
const manifest = readManifest()
const runId = options.runId || createDefaultRunId()
validateRunId(runId)

const runDir = \`.tpan-opt-co-worker/runs/\${runId}\`
const args = ['scripts/verify-workflow.mjs', '--run-dir', runDir]

if (options.manualEvidencePath) {
  args.push('--manual-evidence', options.manualEvidencePath)
}

console.log('TPAN-OPT/CO-WORKER local runner')
console.log(\`Workflow: \${manifest.workflow.name}@\${manifest.workflow.version}\`)
console.log(\`Run directory: \${runDir}\`)

const result = spawnSync(process.execPath, args, {
  cwd: process.cwd(),
  stdio: 'inherit'
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

const exitCode = result.status || 0
updateRunIndex({
  manifest,
  runId,
  runDir,
  exitCode,
  report: readEvidenceReport(runDir)
})

process.exit(exitCode)

function parseArgs(args) {
  const parsed = {
    runId: '',
    manualEvidencePath: ''
  }

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

function readManifest() {
  const rawContent = readFileSync(resolve(MANIFEST_PATH), 'utf8')
  const parsed = JSON.parse(rawContent)

  if (!parsed.workflow || !parsed.workflow.name || !parsed.workflow.version) {
    throw new Error(\`\${MANIFEST_PATH} must include workflow name and version\`)
  }

  return parsed
}

function validateRunId(runId) {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error('--run-id may only contain letters, numbers, dots, underscores, and hyphens')
  }
}

function readEvidenceReport(runDir) {
  const evidencePath = resolve(runDir, 'evidence.json')
  if (!existsSync(evidencePath)) {
    return null
  }

  return JSON.parse(readFileSync(evidencePath, 'utf8'))
}

function updateRunIndex({ manifest, runId, runDir, exitCode, report }) {
  mkdirSync(resolve(RUNS_ROOT), { recursive: true })
  const existingIndex = readRunIndex()
  const runRecord = {
    id: runId,
    workflow: manifest.workflow,
    runDir,
    status: getRunStatus(exitCode, report),
    commandPassed: report?.commandPassed === true,
    allGatesPassed: report?.allGatesPassed === true,
    finishedAt: report?.finishedAt || new Date().toISOString()
  }
  const runs = [
    runRecord,
    ...existingIndex.runs.filter((run) => run.id !== runId)
  ]

  const nextIndex = { runs }
  writeFileSync(resolve(RUN_INDEX_PATH), \`\${JSON.stringify(nextIndex, null, 2)}\\n\`, 'utf8')
  syncConsoleRuns(nextIndex)
}

function syncConsoleRuns(index) {
  mkdirSync(resolve('.tpan-opt-co-worker/console'), { recursive: true })
  const content = JSON.stringify(createConsoleRunsData(index), null, 2)
  writeFileSync(resolve(CONSOLE_RUNS_PATH), \`\${content}\\n\`, 'utf8')
  writeFileSync(
    resolve(CONSOLE_RUNS_SCRIPT_PATH),
    \`window.TPAN_OPT_RUNS = \${content}\\n\`,
    'utf8'
  )
}

function createConsoleRunsData(index) {
  return {
    runs: index.runs,
    details: Object.fromEntries(
      index.runs.map((run) => [run.id, readRunDetails(run)])
    )
  }
}

function readRunDetails(run) {
  const report = readEvidenceReport(run.runDir)
  return {
    commandGates: Array.isArray(report?.commandGates) ? report.commandGates : [],
    manualGates: Array.isArray(report?.manualGates) ? report.manualGates : []
  }
}

function readRunIndex() {
  const indexPath = resolve(RUN_INDEX_PATH)
  if (!existsSync(indexPath)) {
    return {
      runs: []
    }
  }

  const parsed = JSON.parse(readFileSync(indexPath, 'utf8'))
  if (!parsed || !Array.isArray(parsed.runs)) {
    throw new Error(\`\${RUN_INDEX_PATH} must include a runs array\`)
  }

  return parsed
}

function getRunStatus(exitCode, report) {
  if (report?.allGatesPassed === true) {
    return 'passed'
  }

  if (exitCode === 0) {
    return 'pending'
  }

  return 'failed'
}

function createDefaultRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function printHelp() {
  console.log('Usage: node scripts/run-workflow.mjs [--run-id local-run] [--manual-evidence manual-evidence.json]')
}
`
}
