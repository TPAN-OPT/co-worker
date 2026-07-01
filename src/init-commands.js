import { access } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { compileWorkflow, validateWorkflow } from './compiler.js'
import { writeCompiledOutputs } from './file-system.js'
import { renderDemoAgentScript } from './demo-agent-template.js'
import {
  getReusableAgentTeam,
  listReusableAgentTeams
} from './agent-team-catalog.js'
import { getOrganizationPolicyPack } from './policy-catalog.js'
import { policyComplianceGates } from './policy-gates.js'
import { createWorkflowFromTemplate } from './workflow-template.js'

// Shared scaffolding pipeline for init and quickstart: resolve the reusable
// team and policy packs, pick the template (a team's recommendation unless the
// caller set --template), attach organization metadata, and inject the policy
// compliance stage. Returns the workflow plus the resolved template/policy ids
// so callers can report what they produced.
export function buildStarterWorkflow(options) {
  const team = options.team ? getReusableAgentTeam(options.team) : null
  const explicitPolicyIds = options.policyIds.map((policyId) =>
    getOrganizationPolicyPack(policyId).id
  )
  const policyIds = mergePolicyIds([
    ...(team ? team.recommendedPolicies : []),
    ...explicitPolicyIds
  ])
  const template = team && !options.templateSpecified
    ? team.recommendedTemplate
    : options.template
  const organization = team || policyIds.length > 0
    ? {
        ...(team ? { team: team.id } : {}),
        policies: policyIds
      }
    : null
  const baseWorkflow = createWorkflowFromTemplate(template, {
    name: options.name,
    organization
  })
  const workflow = withPolicyComplianceStage(baseWorkflow, policyComplianceGates(policyIds))
  return { workflow, template, team, policyIds }
}

export async function runInit(args) {
  const options = parseInitArgs(args)
  const targetDir = resolve(options.out)
  const { workflow, template, team, policyIds } = buildStarterWorkflow(options)
  const result = await writeCompiledOutputs(
    [
      {
        path: 'opt.workflow.json',
        content: `${JSON.stringify(workflow, null, 2)}\n`
      }
    ],
    targetDir,
    { force: options.force }
  )

  if (team) {
    console.log(
      `Wrote workflow template ${template} for team ${team.id} (policies: ${policyIds.join(', ')}): ${result.written[0]}`
    )
  } else if (policyIds.length > 0) {
    console.log(
      `Wrote workflow template ${template} (policies: ${policyIds.join(', ')}): ${result.written[0]}`
    )
  } else {
    console.log(`Wrote workflow template ${template}: ${result.written[0]}`)
  }

  await scaffoldPackageJson(workflow, targetDir)
  printInitNextSteps(workflow, result.written[0])
}

function printInitNextSteps(workflow, workflowFile) {
  const hasCommandGate = validateWorkflow(workflow).stages.some((stage) =>
    stage.gates.some((gate) => gate.type === 'command')
  )

  console.log('')
  console.log('Next steps:')
  console.log(`  1. Compile harness assets: tpan-opt-co-worker compile --workflow ${workflowFile} --out .`)
  if (hasCommandGate) {
    console.log('  2. Replace the placeholder package.json scripts with your real checks.')
    console.log('  3. Run verification: node scripts/verify-workflow.mjs')
    console.log('  4. Attach manual approvals via --manual-evidence before release.')
  } else {
    console.log('  2. Run verification: node scripts/verify-workflow.mjs --manual-evidence manual-evidence.json')
    console.log('  3. Record approver evidence (approvedBy) for each manual gate before release.')
  }
}

// One-command path from zero to a populated console: scaffold the workflow,
// compile every harness asset, and (unless --no-demo) run a real orchestration
// pass with the first stage pre-approved so the generated console immediately
// shows live stage progress instead of empty panels.
export async function runQuickstart(args) {
  const options = parseQuickstartArgs(args)
  const result = await quickstartProject(options)
  console.log(`Wrote workflow template ${result.template}: ${result.workflowPath}`)
  console.log(`Compiled ${result.assetCount} harness assets into ${result.targetDir}`)
  printQuickstartNextSteps(result.targetDir, result.demo, options.open)
}

// Runs the quickstart pipeline (scaffold + compile + optional demo) and returns
// a structured result instead of logging, so both the CLI command and the MCP
// `quickstart` tool can drive it and format their own output.
export async function quickstartProject(options) {
  const targetDir = resolve(options.out)
  const { workflow, template } = buildStarterWorkflow(options)

  const workflowResult = await writeCompiledOutputs(
    [
      {
        path: 'opt.workflow.json',
        content: `${JSON.stringify(workflow, null, 2)}\n`
      }
    ],
    targetDir,
    { force: options.force }
  )

  const outputs = compileWorkflow(workflow)
  const compileResult = await writeCompiledOutputs(outputs, targetDir, {
    force: options.force
  })

  await scaffoldPackageJson(workflow, targetDir)
  await writeDemoAgent(targetDir)

  const demo = options.demo ? await runQuickstartDemo(workflow, targetDir, options.runId) : null

  return {
    targetDir,
    template,
    workflowPath: workflowResult.written[0],
    assetCount: compileResult.written.length,
    demo
  }
}

// The quickstart workflow's stages gate on a bundled offline demo agent so a
// fresh repo can run the whole team end to end with no agent CLI or network.
// Written for every quickstart (even --no-demo) so the persisted
// orchestration.agentCommand is runnable immediately.
async function writeDemoAgent(targetDir) {
  await writeCompiledOutputs(
    [{ path: 'scripts/demo-agent.mjs', content: renderDemoAgentScript() }],
    targetDir,
    { force: true }
  )
}

// Seed the console with a demo run. The opt-demo template persists an agent
// command, so it gets the headline flow: drive every owner agent end to end.
// Templates without a persisted agent command (minimal, production-feature) fall
// back to the lighter manual-seed demo so they still populate the console.
async function runQuickstartDemo(workflow, targetDir, runId) {
  const normalized = validateWorkflow(workflow)
  if (workflow.orchestration && workflow.orchestration.agentCommand) {
    return runInvokeDemo(normalized, targetDir, runId)
  }
  return runManualSeedDemo(normalized, targetDir, runId)
}

// Drive a real orchestration run with --invoke so the bundled demo agent does
// each stage's work and the console shows a populated, multi-role run. The owner
// agent is invoked for clarify -> implement -> review -> ship; each writes its
// artifact, turning the stage's command gate green, so the run cascades and
// stops at the single human-approval gate. Exit code 1 just means that human
// gate is (correctly) still open, so only a spawn error downgrades to a skip.
// The run id matches `approve`'s default ("local") so finishing is one command.
async function runInvokeDemo(normalized, targetDir, runId) {
  const finalStage = normalized.stages[normalized.stages.length - 1]
  const manualGate = (finalStage.gates || []).find((gate) => gate.type === 'manual')
  const scriptPath = resolve(targetDir, 'scripts', 'orchestrate-workflow.mjs')
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--run-id', runId, '--invoke'],
    { cwd: targetDir, encoding: 'utf8' }
  )

  if (result.error) {
    console.log(
      `Skipped demo orchestration (${result.error.message}). Run it yourself: node scripts/orchestrate-workflow.mjs --run-id ${runId} --invoke`
    )
    return { ran: false, runId }
  }

  return {
    ran: true,
    drove: true,
    runId,
    approveStage: finalStage.id,
    approveGate: manualGate ? manualGate.id : ''
  }
}

// Fallback demo for templates that do not persist an agent command: pre-approve
// the first stage's manual gates and run the orchestrator (no --invoke) so the
// console shows the first stage done and the next as an open work order.
async function runManualSeedDemo(normalized, targetDir, runId) {
  const firstStage = normalized.stages[0]
  const gates = {}
  for (const gate of firstStage.gates) {
    if (gate.type === 'manual') {
      gates[`${firstStage.id}.${gate.id}`] = {
        approvedBy: 'demo@tpan-opt-co-worker.local',
        note: 'Seeded by quickstart demo.'
      }
    }
  }

  const evidenceRelativePath = '.tpan-opt-co-worker/demo/manual-evidence.json'
  await writeCompiledOutputs(
    [{ path: evidenceRelativePath, content: `${JSON.stringify({ gates }, null, 2)}\n` }],
    targetDir,
    { force: true }
  )

  const scriptPath = resolve(targetDir, 'scripts', 'orchestrate-workflow.mjs')
  const evidencePath = resolve(targetDir, evidenceRelativePath)
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--run-id', runId, '--manual-evidence', evidencePath],
    { cwd: targetDir, encoding: 'utf8' }
  )

  if (result.error) {
    console.log(
      `Skipped demo orchestration (${result.error.message}). Run it yourself: node scripts/orchestrate-workflow.mjs --run-id ${runId}`
    )
    return { ran: false, runId }
  }

  return { ran: true, drove: false, runId }
}

function printQuickstartNextSteps(targetDir, demo, open) {
  const consolePath = resolve(targetDir, '.tpan-opt-co-worker', 'console', 'index.html')
  const artifactsPath = resolve(targetDir, '.tpan-opt-co-worker', 'demo', 'artifacts')

  console.log('')
  console.log('Quickstart ready.')
  if (demo && demo.ran && demo.drove) {
    console.log(
      `Your agent team just ran end to end: planner -> engineer -> reviewer -> lead each did their stage and produced an artifact (run "${demo.runId}").`
    )
    console.log(`See what they wrote: ${artifactsPath}`)
  } else if (demo && demo.ran) {
    console.log(`Seeded a demo orchestration run "${demo.runId}" so the console shows live stage progress.`)
  }

  const opened = open ? openInBrowser(consolePath) : false
  console.log('')
  if (opened) {
    console.log(`Opened the console: ${consolePath}`)
  } else {
    console.log(`Open the console in a browser: ${consolePath}`)
  }

  console.log('')
  if (demo && demo.ran && demo.approveGate) {
    const stageFlag = demo.approveStage ? ` --stage ${demo.approveStage}` : ''
    console.log('Everything the agents could do is done — one human approval is left. Approve to finish:')
    console.log(`  tpan-opt-co-worker approve ${demo.approveGate}${stageFlag} --by you`)
  } else {
    console.log('Drive the workflow yourself: node scripts/orchestrate-workflow.mjs --run-id local --invoke')
  }
  console.log('')
  console.log('Run the same flow with a REAL agent (swaps the bundled demo agent):')
  console.log('  node scripts/orchestrate-workflow.mjs --run-id real --invoke --loop \\')
  console.log("    --agent-command 'claude -p \"You are the {role}. Do stage {stage} from brief {brief}. Write your result to .tpan-opt-co-worker/artifacts/{stage}.md\"'")
  console.log('  (swap `claude -p` for `codex exec`, `cursor-agent`, … — any agent CLI works.)')
  console.log('  Then approve: tpan-opt-co-worker approve human_approval --stage ship --by you --run-id real')
  console.log('')
  console.log('Then make it yours: edit opt.workflow.json (or the console Designer) and re-apply:')
  console.log('  tpan-opt-co-worker compile --workflow opt.workflow.json --out . --force')
}

// Best-effort: open the generated console in the default browser, but only when
// running interactively (a TTY, not CI). In tests and automation stdout is not a
// TTY, so this stays a no-op and we just print the path. Never throws.
function openInBrowser(targetPath) {
  if (!process.stdout.isTTY || process.env.CI) {
    return false
  }

  const opener =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open'
  const openerArgs = process.platform === 'win32' ? ['/c', 'start', '', targetPath] : [targetPath]

  try {
    const child = spawn(opener, openerArgs, { stdio: 'ignore', detached: true })
    child.on('error', () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}

// Injects a dedicated policy_compliance stage that enforces the automatable
// rules contributed by the selected organization policies (for example a
// dependency audit). Non-automatable rules stay advisory prompt text. The stage
// is placed before the final stage so compliance runs ahead of release, and is
// skipped when no policy contributes an enforceable gate or when a stage with
// that id already exists.
function withPolicyComplianceStage(workflow, complianceGates) {
  if (complianceGates.length === 0) {
    return workflow
  }

  if (workflow.stages.some((stage) => stage.id === 'policy_compliance')) {
    return workflow
  }

  const complianceStage = {
    id: 'policy_compliance',
    owner: pickComplianceOwner(workflow),
    output: 'policy_compliance_evidence',
    gates: complianceGates
  }

  return {
    ...workflow,
    stages: insertBeforeLastStage(workflow.stages, complianceStage)
  }
}

function pickComplianceOwner(workflow) {
  const roleIds = Object.keys(workflow.roles)
  return roleIds.includes('reviewer') ? 'reviewer' : roleIds[0]
}

function insertBeforeLastStage(stages, stage) {
  if (stages.length === 0) {
    return [stage]
  }

  return [...stages.slice(0, -1), stage, stages[stages.length - 1]]
}

// Templates such as production-feature gate on npm scripts (npm test,
// npm run test:coverage). In a fresh repository those scripts do not exist,
// and `npm` would otherwise climb to a parent package.json and run an
// unrelated project's checks. Scaffold a local placeholder package.json so the
// command gates resolve to this repository and fail honestly until the team
// wires in real checks. Only written when absent so existing manifests are
// never clobbered.
async function scaffoldPackageJson(workflow, targetDir) {
  const npmScripts = collectNpmScriptNames(workflow)

  if (npmScripts.length === 0) {
    return
  }

  if (await targetHasFile(targetDir, 'package.json')) {
    return
  }

  await writeCompiledOutputs(
    [
      {
        path: 'package.json',
        content: renderStarterPackageJson(npmScripts)
      }
    ],
    targetDir,
    { force: false }
  )

  console.log(
    `Scaffolded package.json with placeholder scripts (${npmScripts.join(', ')}). Replace them with your project's real checks before relying on the gates.`
  )
}

function collectNpmScriptNames(workflow) {
  const normalized = validateWorkflow(workflow)
  const names = new Set()

  for (const stage of normalized.stages) {
    for (const gate of stage.gates) {
      if (gate.type !== 'command') {
        continue
      }

      const scriptName = npmScriptNameFromCommand(gate.command)
      if (scriptName) {
        names.add(scriptName)
      }
    }
  }

  return [...names]
}

function npmScriptNameFromCommand(command) {
  if (/^npm\s+test\b/.test(command)) {
    return 'test'
  }

  const runMatch = command.match(/^npm\s+run\s+([A-Za-z0-9:_-]+)\b/)
  if (runMatch) {
    return runMatch[1]
  }

  return null
}

function renderStarterPackageJson(scriptNames) {
  const scripts = Object.fromEntries(
    scriptNames.map((scriptName) => [
      scriptName,
      `echo "Configure the '${scriptName}' script for this repository (placeholder created by TPAN-OPT/CO-WORKER)." && exit 1`
    ])
  )

  const manifest = {
    private: true,
    version: '0.0.0',
    description:
      'Scaffolded by TPAN-OPT/CO-WORKER. Replace the placeholder scripts with your project checks.',
    scripts
  }

  return `${JSON.stringify(manifest, null, 2)}\n`
}

async function targetHasFile(targetDir, relativePath) {
  try {
    await access(resolve(targetDir, relativePath))
    return true
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

function parseInitArgs(args) {
  const options = {
    out: '.',
    name: '',
    template: 'production-feature',
    templateSpecified: false,
    team: '',
    policyIds: [],
    force: false
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--out') {
      options.out = requireNextValue(args, index, '--out')
      index += 1
      continue
    }

    if (arg === '--name') {
      options.name = requireNextValue(args, index, '--name')
      index += 1
      continue
    }

    if (arg === '--template') {
      options.template = requireNextValue(args, index, '--template')
      options.templateSpecified = true
      index += 1
      continue
    }

    if (arg === '--team') {
      options.team = requireNextValue(args, index, '--team')
      index += 1
      continue
    }

    if (arg === '--policy') {
      options.policyIds = [
        ...options.policyIds,
        requireNextValue(args, index, '--policy')
      ]
      index += 1
      continue
    }

    if (arg === '--force') {
      options.force = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printInitHelp()
      process.exit(0)
    }

    throw new Error(`Unknown init option "${arg}"`)
  }

  return options
}

function parseQuickstartArgs(args) {
  const options = {
    out: '.',
    name: '',
    template: 'opt-demo',
    templateSpecified: false,
    team: '',
    policyIds: [],
    force: false,
    demo: true,
    open: true,
    runId: 'local'
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--out') {
      options.out = requireNextValue(args, index, '--out')
      index += 1
      continue
    }

    if (arg === '--name') {
      options.name = requireNextValue(args, index, '--name')
      index += 1
      continue
    }

    if (arg === '--template') {
      options.template = requireNextValue(args, index, '--template')
      options.templateSpecified = true
      index += 1
      continue
    }

    if (arg === '--team') {
      options.team = requireNextValue(args, index, '--team')
      index += 1
      continue
    }

    if (arg === '--policy') {
      options.policyIds = [
        ...options.policyIds,
        requireNextValue(args, index, '--policy')
      ]
      index += 1
      continue
    }

    if (arg === '--run-id') {
      options.runId = requireNextValue(args, index, '--run-id')
      index += 1
      continue
    }

    if (arg === '--force') {
      options.force = true
      continue
    }

    if (arg === '--no-demo') {
      options.demo = false
      continue
    }

    if (arg === '--no-open') {
      options.open = false
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printQuickstartHelp()
      process.exit(0)
    }

    throw new Error(`Unknown quickstart option "${arg}"`)
  }

  return options
}

function mergePolicyIds(policyIds) {
  return [...new Set(policyIds)]
}

function requireNextValue(args, index, name) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }

  return value
}

export function printQuickstartHelp() {
  const defaultTeam = listReusableAgentTeams()[0].id

  console.log(`Usage:
  tpan-opt-co-worker quickstart --out . [--template opt-demo] [--team ${defaultTeam}] [--name workflow-name] [--no-demo] [--no-open] [--force]

Scaffold opt.workflow.json, compile every harness asset, bundle an offline demo
agent, and (by default) run the four-role team end to end with --invoke so the
console shows a real, populated run that stops at a single human approval.

Options:
  --out <dir>       Output repository directory. Defaults to current directory.
  --template <id>   Workflow template id. Defaults to opt-demo (runnable agent team).
  --team <id>       Reusable agent team id. Uses the team's recommended template unless --template is set.
  --policy <id>     Organization policy pack id. Can be repeated.
  --name <id>       Workflow name. Defaults to the selected template's default name.
  --run-id <id>     Demo orchestration run id. Defaults to local (so \`approve\` finishes it).
  --no-demo         Scaffold and compile only; do not run the demo orchestration.
  --no-open         Do not open the console in a browser when finishing.
  --force           Overwrite existing files in the output directory.
`)
}

export function printInitHelp() {
  const defaultTeam = listReusableAgentTeams()[0].id

  console.log(`Usage:
  tpan-opt-co-worker init --out . [--template production-feature] [--team ${defaultTeam}] [--policy quality-standard] [--name workflow-name] [--force]

Options:
  --out <dir>       Output repository directory. Defaults to current directory.
  --template <id>   Workflow template id. Defaults to production-feature. Use minimal for language-neutral manual gates.
  --team <id>       Reusable agent team id. Uses the team's recommended template unless --template is set.
  --policy <id>     Organization policy pack id. Can be repeated.
  --name <id>       Workflow name. Defaults to the selected template's default name.
  --force           Overwrite an existing opt.workflow.json.

Notes:
  The default production-feature template uses npm test and npm run test:coverage gates.
  Target repositories should provide those package.json scripts or override the gate presets.
`)
}
