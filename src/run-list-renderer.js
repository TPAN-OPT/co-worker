export function renderRunListScript() {
  return `#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX_PATH = '.tpan-opt-co-worker/runs/index.json'
const options = parseArgs(process.argv.slice(2))
const index = readRunIndex()

if (options.json) {
  console.log(JSON.stringify(index, null, 2))
  process.exit(0)
}

if (index.runs.length === 0) {
  console.log('No TPAN-OPT/CO-WORKER runs found.')
  process.exit(0)
}

console.log('TPAN-OPT/CO-WORKER runs')
for (const run of index.runs) {
  console.log(
    [run.id, run.status, \`\${run.workflow.name}@\${run.workflow.version}\`, run.finishedAt, run.runDir].join(
      ' | '
    )
  )
}

function parseArgs(args) {
  const parsed = {
    json: false
  }

  for (const arg of args) {
    if (arg === '--json') {
      parsed.json = true
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

function readRunIndex() {
  const indexPath = projectPath(INDEX_PATH)
  if (!existsSync(indexPath)) {
    return {
      runs: []
    }
  }

  const parsed = JSON.parse(readFileSync(indexPath, 'utf8'))
  if (!parsed || !Array.isArray(parsed.runs)) {
    throw new Error(\`\${INDEX_PATH} must include a runs array\`)
  }

  return parsed
}

function projectPath(...segments) {
  return resolve(PROJECT_ROOT, ...segments)
}

function printHelp() {
  console.log('Usage: node scripts/list-runs.mjs [--json]')
}
`
}
