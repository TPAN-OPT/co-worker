import { basename, dirname, resolve } from 'node:path'
import { listReusableAgentTeams } from './agent-team-catalog.js'
import {
  createCatalog,
  createPresetSummary,
  renderCatalogJson,
  renderMarketplaceJson
} from './catalog-renderer.js'
import { writeCompiledOutputs } from './file-system.js'
import { listMarketplacePackages } from './marketplace-catalog.js'
import { listOrganizationPolicyPacks } from './policy-catalog.js'
import { listWorkflowTemplates } from './workflow-template.js'

export async function runCatalog(args) {
  const options = parseCatalogArgs(args)
  const catalog = createCatalog()
  const content = renderCatalogJson()

  if (options.out) {
    const outputPath = resolve(options.out)
    const result = await writeCompiledOutputs(
      [
        {
          path: basename(outputPath),
          content
        }
      ],
      dirname(outputPath),
      { force: options.force }
    )

    console.log(`Wrote catalog: ${result.written[0]}`)
    return
  }

  if (options.json) {
    console.log(content)
    return
  }

  console.log('TPAN-OPT/CO-WORKER catalog:')
  console.log(`- Presets: ${catalog.presets.length}`)
  console.log(`- Templates: ${catalog.templates.length}`)
  console.log(`- Policies: ${catalog.policies.length}`)
  console.log(`- Teams: ${catalog.teams.length}`)
  console.log(`- Marketplace: ${catalog.marketplace.length}`)
}

export async function runPresets(args) {
  const options = parseJsonOnlyArgs(args, {
    command: 'presets',
    jsonDescription: 'Print built-in gate presets as machine-readable JSON.'
  })
  const presets = createPresetSummary()

  if (options.json) {
    console.log(`${JSON.stringify({ presets }, null, 2)}\n`)
    return
  }

  console.log('Built-in gate presets:')
  for (const preset of presets) {
    const command = preset.command ? ` -> ${preset.command}` : ''
    console.log(`- ${preset.id} [${preset.type}] ${preset.description}${command}`)
  }
}

export async function runTemplates(args) {
  const options = parseJsonOnlyArgs(args, {
    command: 'templates',
    jsonDescription: 'Print workflow templates as machine-readable JSON.'
  })
  const templates = listWorkflowTemplates()

  if (options.json) {
    console.log(`${JSON.stringify({ templates }, null, 2)}\n`)
    return
  }

  console.log('Workflow templates:')
  for (const template of templates) {
    console.log(`- ${template.id}: ${template.description}`)
  }
}

export async function runPolicies(args) {
  const options = parseJsonOnlyArgs(args, {
    command: 'policies',
    jsonDescription: 'Print organization policy packs as machine-readable JSON.'
  })
  const policies = listOrganizationPolicyPacks()

  if (options.json) {
    console.log(`${JSON.stringify({ policies }, null, 2)}\n`)
    return
  }

  console.log('Organization policy packs:')
  for (const policy of policies) {
    console.log(`- ${policy.id}: ${policy.description}`)
  }
}

export async function runTeams(args) {
  const options = parseJsonOnlyArgs(args, {
    command: 'teams',
    jsonDescription: 'Print reusable agent teams as machine-readable JSON.'
  })
  const teams = listReusableAgentTeams()

  if (options.json) {
    console.log(`${JSON.stringify({ teams }, null, 2)}\n`)
    return
  }

  console.log('Reusable agent teams:')
  for (const team of teams) {
    console.log(`- ${team.id}: ${team.roles.join(', ')} - ${team.description}`)
  }
}

export async function runMarketplace(args) {
  const options = parseWritableJsonArgs(args, {
    command: 'marketplace',
    jsonDescription: 'Print marketplace distribution packages as machine-readable JSON.',
    outDescription: 'Write marketplace catalog JSON to a file.',
    outExample: 'marketplace.json'
  })
  const marketplace = listMarketplacePackages()
  const content = renderMarketplaceJson()

  if (options.out) {
    const outputPath = resolve(options.out)
    const result = await writeCompiledOutputs(
      [
        {
          path: basename(outputPath),
          content
        }
      ],
      dirname(outputPath),
      { force: options.force }
    )

    console.log(`Wrote marketplace catalog: ${result.written[0]}`)
    return
  }

  if (options.json) {
    console.log(content)
    return
  }

  console.log('Marketplace distribution packages:')
  for (const marketplacePackage of marketplace) {
    console.log(
      `- ${marketplacePackage.id} [${marketplacePackage.type}] ${marketplacePackage.description}`
    )
  }
}

function parseCatalogArgs(args) {
  const options = {
    json: false,
    out: '',
    force: false
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--json') {
      options.json = true
      continue
    }

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
      printCatalogHelp()
      process.exit(0)
    }

    throw new Error(`Unknown catalog option "${arg}"`)
  }

  return options
}

function parseJsonOnlyArgs(args, help) {
  const options = {
    json: false
  }

  for (const arg of args) {
    if (arg === '--json') {
      options.json = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printJsonOnlyHelp(help)
      process.exit(0)
    }

    throw new Error(`Unknown ${help.command} option "${arg}"`)
  }

  return options
}

function parseWritableJsonArgs(args, help) {
  const options = {
    json: false,
    out: '',
    force: false
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--json') {
      options.json = true
      continue
    }

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
      printWritableJsonHelp(help)
      process.exit(0)
    }

    throw new Error(`Unknown ${help.command} option "${arg}"`)
  }

  return options
}

function printCatalogHelp() {
  console.log(`Usage:
  tpan-opt-co-worker catalog [--json] [--out catalog.json] [--force]

Options:
  --json        Print the combined catalog as machine-readable JSON.
  --out <path>  Write the combined catalog JSON to a file.
  --force       Overwrite an existing catalog file.
`)
}

function printJsonOnlyHelp(help) {
  console.log(`Usage:
  tpan-opt-co-worker ${help.command} [--json]

Options:
  --json  ${help.jsonDescription}
`)
}

function printWritableJsonHelp(help) {
  console.log(`Usage:
  tpan-opt-co-worker ${help.command} [--json] [--out ${help.outExample || 'catalog.json'}] [--force]

Options:
  --json        ${help.jsonDescription}
  --out <path>  ${help.outDescription}
  --force       Overwrite an existing output file.
`)
}

function requireNextValue(args, index, name) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }

  return value
}
