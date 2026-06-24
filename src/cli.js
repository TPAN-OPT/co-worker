#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import {
  getReusableAgentTeam,
  listReusableAgentTeams
} from './agent-team-catalog.js'
import {
  runCatalog,
  runMarketplace,
  runPolicies,
  runPresets,
  runTeams,
  runTemplates
} from './catalog-commands.js'
import { compileWorkflow, validateWorkflow } from './compiler.js'
import { writeCompiledOutputs } from './file-system.js'
import { getOrganizationPolicyPack } from './policy-catalog.js'
import { renderWorkflowSchema } from './schema-renderer.js'
import { createWorkflowFromTemplate } from './workflow-template.js'

async function main(argv) {
  const command = argv[2]

  if (!command || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  if (command === 'compile') {
    await runCompile(argv.slice(3))
    return
  }

  if (command === 'validate') {
    await runValidate(argv.slice(3))
    return
  }

  if (command === 'schema') {
    await runSchema(argv.slice(3))
    return
  }

  if (command === 'presets') {
    await runPresets(argv.slice(3))
    return
  }

  if (command === 'catalog') {
    await runCatalog(argv.slice(3))
    return
  }

  if (command === 'templates') {
    await runTemplates(argv.slice(3))
    return
  }

  if (command === 'policies') {
    await runPolicies(argv.slice(3))
    return
  }

  if (command === 'teams') {
    await runTeams(argv.slice(3))
    return
  }

  if (command === 'marketplace') {
    await runMarketplace(argv.slice(3))
    return
  }

  if (command === 'init') {
    await runInit(argv.slice(3))
    return
  }

  printHelp()
  process.exitCode = 1
}

async function runInit(args) {
  const options = parseInitArgs(args)
  const targetDir = resolve(options.out)
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
  const workflow = createWorkflowFromTemplate(template, {
    name: options.name,
    organization
  })
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
    return
  }

  if (policyIds.length > 0) {
    console.log(
      `Wrote workflow template ${template} (policies: ${policyIds.join(', ')}): ${result.written[0]}`
    )
    return
  }

  console.log(`Wrote workflow template ${template}: ${result.written[0]}`)
}

async function runCompile(args) {
  const options = parseCompileArgs(args)
  const workflowPath = resolve(options.workflow)
  const targetDir = resolve(options.out)
  const workflow = await readWorkflow(workflowPath)
  const externalGatePresets = await readExternalGatePresets(options.presetFiles)
  const mergedWorkflow = mergeWorkflowGatePresets(workflow, externalGatePresets)
  const outputs = compileWorkflow(mergedWorkflow)
  const result = await writeCompiledOutputs(outputs, targetDir, {
    force: options.force,
    dryRun: options.dryRun
  })

  if (options.dryRun) {
    console.log(`Would write ${result.planned.length} files:`)
    for (const path of result.planned) {
      console.log(`- ${path}`)
    }
    return
  }

  console.log(`Wrote ${result.written.length} files:`)
  for (const path of result.written) {
    console.log(`- ${path}`)
  }
}

async function runValidate(args) {
  const options = parseValidateArgs(args)
  const workflowPath = resolve(options.workflow)
  const workflow = await readWorkflow(workflowPath)
  const externalGatePresets = await readExternalGatePresets(options.presetFiles)
  const mergedWorkflow = mergeWorkflowGatePresets(workflow, externalGatePresets)
  const normalizedWorkflow = validateWorkflow(mergedWorkflow)
  const summary = createValidationSummary(normalizedWorkflow)

  if (options.json) {
    console.log(`${JSON.stringify(summary, null, 2)}\n`)
    return
  }

  console.log(`Workflow valid: ${normalizedWorkflow.name}@${normalizedWorkflow.version}`)
  console.log(`Roles: ${summary.counts.roles}`)
  console.log(`Stages: ${summary.counts.stages}`)
  console.log(`Gates: ${summary.counts.gates}`)
}

async function runSchema(args) {
  const options = parseSchemaArgs(args)
  const content = renderWorkflowSchema()

  if (!options.out) {
    process.stdout.write(content)
    return
  }

  const schemaPath = resolve(options.out)
  const result = await writeCompiledOutputs(
    [
      {
        path: basename(schemaPath),
        content
      }
    ],
    dirname(schemaPath),
    { force: options.force }
  )

  console.log(`Wrote workflow schema: ${result.written[0]}`)
}

function parseCompileArgs(args) {
  const options = {
    workflow: 'opt.workflow.json',
    out: '.',
    presetFiles: [],
    force: false,
    dryRun: false
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--workflow') {
      options.workflow = requireNextValue(args, index, '--workflow')
      index += 1
      continue
    }

    if (arg === '--out') {
      options.out = requireNextValue(args, index, '--out')
      index += 1
      continue
    }

    if (arg === '--preset-file') {
      options.presetFiles = [
        ...options.presetFiles,
        requireNextValue(args, index, '--preset-file')
      ]
      index += 1
      continue
    }

    if (arg === '--force') {
      options.force = true
      continue
    }

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printCompileHelp()
      process.exit(0)
    }

    throw new Error(`Unknown compile option "${arg}"`)
  }

  return options
}

function parseValidateArgs(args) {
  const options = {
    workflow: 'opt.workflow.json',
    presetFiles: [],
    json: false
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--workflow') {
      options.workflow = requireNextValue(args, index, '--workflow')
      index += 1
      continue
    }

    if (arg === '--preset-file') {
      options.presetFiles = [
        ...options.presetFiles,
        requireNextValue(args, index, '--preset-file')
      ]
      index += 1
      continue
    }

    if (arg === '--json') {
      options.json = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printValidateHelp()
      process.exit(0)
    }

    throw new Error(`Unknown validate option "${arg}"`)
  }

  return options
}

function parseSchemaArgs(args) {
  const options = {
    out: '',
    force: false
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--out') {
      options.out = requireNextValue(args, index, '--out')
      index += 1
      continue
    }

    if (arg === '--force') {
      options.force = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printSchemaHelp()
      process.exit(0)
    }

    throw new Error(`Unknown schema option "${arg}"`)
  }

  return options
}

function parseInitArgs(args) {
  const options = {
    out: '.',
    name: 'production-feature-workflow',
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

async function readWorkflow(path) {
  return readJsonFile(path, 'workflow')
}

async function readJsonFile(path, label) {
  const rawContent = await readFile(path, 'utf8')
  try {
    return JSON.parse(rawContent)
  } catch (error) {
    throw new Error(`Failed to parse ${label} JSON at ${path}: ${error.message}`)
  }
}

async function readExternalGatePresets(presetFiles) {
  const registries = await Promise.all(
    presetFiles.map(async (presetFile) => {
      const presetPath = resolve(presetFile)
      const registry = await readJsonFile(presetPath, 'gate preset registry')
      return extractGatePresets(registry, presetPath)
    })
  )

  return mergeGatePresetObjects(registries)
}

function extractGatePresets(registry, path) {
  if (!isPlainObject(registry) || !isPlainObject(registry.gatePresets)) {
    throw new Error(`Gate preset registry at ${path} must include a gatePresets object`)
  }

  return registry.gatePresets
}

function mergeWorkflowGatePresets(workflow, externalGatePresets) {
  if (Object.keys(externalGatePresets).length === 0) {
    return workflow
  }

  const workflowGatePresets = isPlainObject(workflow.gatePresets)
    ? workflow.gatePresets
    : {}
  const duplicatePresetIds = Object.keys(externalGatePresets).filter((presetId) =>
    Object.hasOwn(workflowGatePresets, presetId)
  )

  if (duplicatePresetIds.length > 0) {
    throw new Error(`Duplicate gate preset "${duplicatePresetIds[0]}"`)
  }

  return {
    ...workflow,
    gatePresets: {
      ...externalGatePresets,
      ...workflowGatePresets
    }
  }
}

function mergeGatePresetObjects(registries) {
  const merged = {}

  for (const registry of registries) {
    for (const [presetId, preset] of Object.entries(registry)) {
      if (Object.hasOwn(merged, presetId)) {
        throw new Error(`Duplicate gate preset "${presetId}"`)
      }

      merged[presetId] = preset
    }
  }

  return merged
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function countWorkflowGates(workflow) {
  return workflow.stages.reduce((total, stage) => total + stage.gates.length, 0)
}

function countWorkflowGatesByType(workflow, type) {
  return workflow.stages.reduce(
    (total, stage) =>
      total + stage.gates.filter((gate) => gate.type === type).length,
    0
  )
}

function createValidationSummary(workflow) {
  return {
    valid: true,
    workflow: {
      name: workflow.name,
      version: workflow.version
    },
    counts: {
      roles: Object.keys(workflow.roles).length,
      stages: workflow.stages.length,
      gates: countWorkflowGates(workflow),
      manualGates: countWorkflowGatesByType(workflow, 'manual'),
      commandGates: countWorkflowGatesByType(workflow, 'command')
    },
    roles: Object.keys(workflow.roles),
    stages: workflow.stages.map((stage) => ({
      id: stage.id,
      owner: stage.owner,
      gateIds: stage.gates.map((gate) => gate.id)
    }))
  }
}

function printHelp() {
  const defaultTeam = listReusableAgentTeams()[0].id

  console.log(`TPAN-OPT/CO-WORKER

Usage:
  tpan-opt-co-worker init --out . [--template production-feature] [--team ${defaultTeam}] [--policy quality-standard] [--name production-feature-workflow] [--force]
  tpan-opt-co-worker validate --workflow opt.workflow.json [--preset-file gate-presets.json] [--json]
  tpan-opt-co-worker catalog [--json]
  tpan-opt-co-worker presets [--json]
  tpan-opt-co-worker templates [--json]
  tpan-opt-co-worker policies [--json]
  tpan-opt-co-worker teams [--json]
  tpan-opt-co-worker marketplace [--json] [--out marketplace.json] [--force]
  tpan-opt-co-worker schema [--out workflow.schema.json] [--force]
  tpan-opt-co-worker compile --workflow opt.workflow.json --out . [--preset-file gate-presets.json] [--force] [--dry-run]

Commands:
  init       Create a starter opt.workflow.json template.
  validate   Validate a workflow definition without writing generated assets.
  catalog    List the combined built-in catalog.
  presets    List built-in gate presets.
  templates  List built-in workflow templates.
  policies   List built-in organization policy packs.
  teams      List built-in reusable agent teams.
  marketplace
             List marketplace distribution packages.
  schema     Print or write the workflow JSON Schema.
  compile    Compile a workflow definition into repository assets.
`)
}

function printInitHelp() {
  const defaultTeam = listReusableAgentTeams()[0].id

  console.log(`Usage:
  tpan-opt-co-worker init --out . [--template production-feature] [--team ${defaultTeam}] [--policy quality-standard] [--name production-feature-workflow] [--force]

Options:
  --out <dir>       Output repository directory. Defaults to current directory.
  --template <id>   Workflow template id. Defaults to production-feature.
  --team <id>       Reusable agent team id. Uses the team's recommended template unless --template is set.
  --policy <id>     Organization policy pack id. Can be repeated.
  --name <id>       Workflow name. Defaults to production-feature-workflow.
  --force           Overwrite an existing opt.workflow.json.

Notes:
  The default production-feature template uses npm test and npm run test:coverage gates.
  Target repositories should provide those package.json scripts or override the gate presets.
`)
}

function printValidateHelp() {
  console.log(`Usage:
  tpan-opt-co-worker validate --workflow opt.workflow.json [--preset-file gate-presets.json] [--json]

Options:
  --workflow <path>  Workflow JSON file. Defaults to opt.workflow.json.
  --preset-file <path>
                     External gate preset registry JSON. Can be repeated.
  --json             Print a machine-readable validation summary.
`)
}

function printSchemaHelp() {
  console.log(`Usage:
  tpan-opt-co-worker schema [--out workflow.schema.json] [--force]

Options:
  --out <path>  Write the workflow JSON Schema to a file instead of stdout.
  --force       Overwrite an existing schema file.
`)
}

function printCompileHelp() {
  console.log(`Usage:
  tpan-opt-co-worker compile --workflow opt.workflow.json --out . [--preset-file gate-presets.json] [--force] [--dry-run]

Options:
  --workflow <path>  Workflow JSON file. Defaults to opt.workflow.json.
  --preset-file <path>
                     External gate preset registry JSON. Can be repeated.
  --out <dir>        Output repository directory. Defaults to current directory.
  --force            Overwrite existing generated files.
  --dry-run          Print planned outputs without writing files.

Notes:
  npm-based gates require package.json scripts in the generated target repository.
  Use --preset-file or workflow-defined gatePresets to adapt gates for non-Node projects.
`)
}

main(process.argv).catch((error) => {
  console.error(`Error: ${error.message}`)
  process.exitCode = 1
})
