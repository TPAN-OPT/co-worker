import { access } from 'node:fs/promises'
import { resolve } from 'node:path'

import { SELECTABLE_HARNESSES, compileWorkflow, parseHarnessSelection, validateWorkflow } from './compiler.js'
import { writeCompiledOutputs } from './file-system.js'
import { detectAgents } from './agent-detect.js'
import {
  getReusableAgentTeam,
  listReusableAgentTeams
} from './agent-team-catalog.js'
import { getOrganizationPolicyPack } from './policy-catalog.js'
import { policyComplianceGates } from './policy-gates.js'
import { createWorkflowFromTemplate } from './workflow-template.js'
import {
  printQuickstartNextSteps,
  resolveRealAgentPlan,
  runQuickstartDemo,
  writeDemoAgent
} from './quickstart-demo.js'

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
  printQuickstartNextSteps(result.targetDir, result.demo, options.open, result.detectedAgents)
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

  const outputs = compileWorkflow(workflow, { harnesses: options.harnesses })
  const compileResult = await writeCompiledOutputs(outputs, targetDir, {
    force: options.force
  })

  await scaffoldPackageJson(workflow, targetDir)
  await writeDemoAgent(targetDir)

  const detectedAgents = detectAgents()
  const realPlan = resolveRealAgentPlan(options, detectedAgents)
  const demo = options.demo
    ? await runQuickstartDemo(workflow, targetDir, options, realPlan)
    : null

  return {
    targetDir,
    template,
    workflowPath: workflowResult.written[0],
    assetCount: compileResult.written.length,
    demo,
    detectedAgents
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
    runId: 'local',
    runIdSpecified: false,
    real: false,
    agent: '',
    harnesses: []
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

    if (arg === '--harness') {
      options.harnesses.push(...parseHarnessSelection(requireNextValue(args, index, '--harness')))
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
      options.runIdSpecified = true
      index += 1
      continue
    }

    if (arg === '--real') {
      options.real = true
      continue
    }

    if (arg === '--agent') {
      options.agent = requireNextValue(args, index, '--agent')
      options.real = true
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
  tpan-opt-co-worker quickstart --out . [--template opt-demo] [--team ${defaultTeam}] [--name workflow-name] [--real [--agent <id>]] [--no-demo] [--no-open] [--force]

Scaffold opt.workflow.json, compile every harness asset, bundle an offline demo
agent, and (by default) run the four-role team end to end with --invoke so the
console shows a real, populated run that stops at a single human approval.

With --real, drive an installed agent CLI (claude, codex, cursor-agent) instead
of the offline demo so the run produces real work; falls back to the offline
demo (and says so) when no supported agent is on PATH.

Options:
  --out <dir>       Output repository directory. Defaults to current directory.
  --template <id>   Workflow template id. Defaults to opt-demo (runnable agent team).
  --team <id>       Reusable agent team id. Uses the team's recommended template unless --template is set.
  --policy <id>     Organization policy pack id. Can be repeated.
  --name <id>       Workflow name. Defaults to the selected template's default name.
  --real            Drive an installed agent CLI for real work instead of the offline demo.
  --agent <id>      Which detected agent to use with --real (claude, codex, cursor-agent). Implies --real.
  --harness <id>    Only compile files for this harness (${SELECTABLE_HARNESSES.join(', ')}). Comma-separated, repeatable. Core assets are always written.
  --run-id <id>     Demo orchestration run id. Defaults to local (real runs default to real).
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
