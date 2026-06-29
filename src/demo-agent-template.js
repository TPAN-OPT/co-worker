// The quickstart bundles a tiny, zero-dependency "demo agent" into the target
// repository so a brand-new user can watch a full multi-role run happen for
// real — with no agent CLI installed, no API key, and no network. It stands in
// for a real code agent (Claude Code, Codex, Cursor, …): the orchestrator
// invokes it per stage exactly as it would invoke a real one, and it produces a
// believable artifact for that stage. The generated script is self-contained so
// it keeps working after the user deletes this package.
//
// It runs in two modes, both driven by the generated orchestrator:
//   --stage <id> --role <r> [--brief <path>]  do the stage's work, write an artifact
//   --check <id>                              gate check: exit 0 once the artifact exists
// The check-then-do pairing is what makes each invocation visible: a stage's
// command gate is red until its owner agent runs and writes the artifact, so the
// run cascades stage by stage and the console shows a populated invocation log.
//
// The --check gate is agent-neutral on purpose: it passes once a stage artifact
// exists at EITHER the bundled demo path OR the stable agent path
// `.tpan-opt-co-worker/artifacts/<stage>.md`. That second path is the swap seam —
// point the orchestrator at a real agent (Claude Code, Codex, …) and tell it to
// write its stage result there, and the same gates cascade with zero demo code.
export function renderDemoAgentScript() {
  return `#!/usr/bin/env node
// Bundled offline demo agent for TPAN-OPT/CO-WORKER (created by \`quickstart\`).
// Stands in for a real code agent so the quickstart run works with zero setup.
// Swap it for a real agent by re-running the orchestrator with your own command;
// have the agent write its stage result to .tpan-opt-co-worker/artifacts/{stage}.md
// so the same gates cascade:
//   node scripts/orchestrate-workflow.mjs --run-id real --invoke --loop \\
//     --agent-command "claude -p 'Do stage {stage} from {brief}; write .tpan-opt-co-worker/artifacts/{stage}.md'"
// The orchestrator substitutes {stage} {role} {brief} {skills} {mcpServers} {hooks}.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const ARTIFACT_DIR = '.tpan-opt-co-worker/demo/artifacts'
// Stable, agent-neutral path a real agent writes its stage result to. The gate
// check accepts an artifact here as well as the demo path, so swapping in a real
// agent cascades the same gates without touching the workflow definition.
const AGENT_ARTIFACT_DIR = '.tpan-opt-co-worker/artifacts'

const STAGE_BODIES = {
  clarify: [
    '## Capability',
    '- Goal: deliver the requested change with a verifiable definition of done.',
    '- In scope: the one user-facing behavior described in the brief.',
    '',
    '## Non-goals',
    '- No unrelated refactors; no scope creep beyond the brief.',
    '',
    '## Handoff to engineering',
    '- Acceptance: behavior works end to end and is covered by a check.'
  ],
  implement: [
    '## What was built',
    '- Implemented the capability from the clarify spec behind the existing entry point.',
    '- Added a focused check so the behavior is verifiable.',
    '',
    '## Files touched (demo)',
    '- \`src/feature.example\` — new behavior',
    '- \`test/feature.example\` — covering check',
    '',
    'Local checks: green.'
  ],
  review: [
    '## Review summary',
    '- Correctness: the change matches the clarify spec and acceptance criteria.',
    '- Security: no untrusted input reaches a sensitive sink in the demo change.',
    '- Maintainability: naming and structure match the surrounding code.',
    '',
    '**Verdict: approve.** No unresolved high-severity findings.'
  ],
  ship: [
    '## Release packet',
    '- Plan, implementation, and review evidence are attached to this run.',
    '- Changelog: adds the clarified capability with a covering check.',
    '',
    '## Awaiting human approval',
    'All agent work is done. A human lead must approve before release:',
    '',
    '    tpan-opt-co-worker approve human_approval --stage ship --by you'
  ]
}

function artifactPath(stageId) {
  return resolve(process.cwd(), ARTIFACT_DIR, \`\${stageId}.md\`)
}

function agentArtifactPath(stageId) {
  return resolve(process.cwd(), AGENT_ARTIFACT_DIR, \`\${stageId}.md\`)
}

function relativeOut(absolute) {
  return absolute.startsWith(process.cwd())
    ? absolute.slice(process.cwd().length + 1)
    : absolute
}

function title(stageId) {
  return stageId.charAt(0).toUpperCase() + stageId.slice(1)
}

function renderArtifact(stageId, roleId, workOrder) {
  const output = (workOrder && workOrder.output) || \`\${stageId}_output\`
  const skills = (workOrder && Array.isArray(workOrder.skills) ? workOrder.skills : [])
    .concat((process.env.TPAN_OPT_SKILLS || '').split(',').filter(Boolean))
  const skillLine = skills.length ? \`Skills applied: \${[...new Set(skills)].join(', ')}.\` : ''
  const body = STAGE_BODIES[stageId] || [
    \`The \${roleId} agent completed stage "\${stageId}" and produced \${output}.\`
  ]
  return [
    \`# \${title(stageId)} — produced by the \${roleId} agent\`,
    '',
    \`> Demo artifact written by the bundled offline demo agent for output \\\`\${output}\\\`.\`,
    skillLine ? \`> \${skillLine}\` : '',
    '',
    ...body,
    '',
    '_Replace the demo agent with a real one to produce real work here._',
    ''
  ].filter((line) => line !== '').join('\\n')
}

function readBrief(briefPath) {
  if (!briefPath) {
    return null
  }
  try {
    return JSON.parse(readFileSync(briefPath, 'utf8'))
  } catch {
    return null
  }
}

function parseArgs(argv) {
  const parsed = { stage: '', role: '', brief: '', check: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--stage') { parsed.stage = argv[index + 1] || ''; index += 1; continue }
    if (arg === '--role') { parsed.role = argv[index + 1] || ''; index += 1; continue }
    if (arg === '--brief') { parsed.brief = argv[index + 1] || ''; index += 1; continue }
    if (arg === '--check') { parsed.check = argv[index + 1] || ''; index += 1; continue }
  }
  return parsed
}

const args = parseArgs(process.argv.slice(2))

// Gate-check mode: report whether this stage's artifact has been produced yet,
// by the bundled demo agent or by a real agent writing to the agent path.
if (args.check) {
  const produced = existsSync(artifactPath(args.check)) || existsSync(agentArtifactPath(args.check))
  process.exit(produced ? 0 : 1)
}

const stage = args.stage || process.env.TPAN_OPT_STAGE || 'stage'
const role = args.role || process.env.TPAN_OPT_ROLE || 'agent'
const brief = readBrief(args.brief || process.env.TPAN_OPT_BRIEF)
const outputPath = artifactPath(stage)
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, renderArtifact(stage, role, brief))
console.log(\`demo-agent: \${role} completed "\${stage}" -> \${relativeOut(outputPath)}\`)
`
}
