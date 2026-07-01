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

// The catalog is the single discovery surface. Each "kind" is one slice of the
// combined catalog; `catalog --kind <id>` prints that slice, and the historical
// standalone commands (presets/templates/policies/teams/marketplace) are thin
// aliases onto the same renderers so nothing that scripted against them breaks.
const CATALOG_KINDS = {
  presets: {
    jsonKey: 'presets',
    heading: 'Built-in gate presets:',
    load: () => createPresetSummary(),
    line: (preset) =>
      `- ${preset.id} [${preset.type}] ${preset.description}${preset.command ? ` -> ${preset.command}` : ''}`
  },
  templates: {
    jsonKey: 'templates',
    heading: 'Workflow templates:',
    load: () => listWorkflowTemplates(),
    line: (template) => `- ${template.id}: ${template.description}`
  },
  policies: {
    jsonKey: 'policies',
    heading: 'Organization policy packs:',
    load: () => listOrganizationPolicyPacks(),
    line: (policy) => `- ${policy.id}: ${policy.description}`
  },
  teams: {
    jsonKey: 'teams',
    heading: 'Reusable agent teams:',
    load: () => listReusableAgentTeams(),
    line: (team) => `- ${team.id}: ${team.roles.join(', ')} - ${team.description}`
  },
  marketplace: {
    jsonKey: 'marketplace',
    heading:
      'Marketplace distribution packages (metadata preview; install is not yet implemented):',
    load: () => listMarketplacePackages(),
    line: (item) => `- ${item.id} [${item.type}] ${item.description}`
  }
}

const CATALOG_KIND_IDS = Object.keys(CATALOG_KINDS)

function printCatalogKind(kind, options) {
  const spec = CATALOG_KINDS[kind]
  const items = spec.load()

  if (options.json) {
    console.log(`${JSON.stringify({ [spec.jsonKey]: items }, null, 2)}\n`)
    return
  }

  console.log(spec.heading)
  for (const item of items) {
    console.log(spec.line(item))
  }
}

export async function runCatalog(args) {
  const options = parseCatalogArgs(args)

  if (options.kind) {
    printCatalogKind(options.kind, options)
    return
  }

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
  printCatalogKind('presets', options)
}

export async function runTemplates(args) {
  const options = parseJsonOnlyArgs(args, {
    command: 'templates',
    jsonDescription: 'Print workflow templates as machine-readable JSON.'
  })
  printCatalogKind('templates', options)
}

export async function runPolicies(args) {
  const options = parseJsonOnlyArgs(args, {
    command: 'policies',
    jsonDescription: 'Print organization policy packs as machine-readable JSON.'
  })
  printCatalogKind('policies', options)
}

export async function runTeams(args) {
  const options = parseJsonOnlyArgs(args, {
    command: 'teams',
    jsonDescription: 'Print reusable agent teams as machine-readable JSON.'
  })
  printCatalogKind('teams', options)
}

export async function runMarketplace(args) {
  const options = parseWritableJsonArgs(args, {
    command: 'marketplace',
    jsonDescription: 'Print marketplace distribution packages as machine-readable JSON.',
    outDescription: 'Write marketplace catalog JSON to a file.',
    outExample: 'marketplace.json'
  })
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

  printCatalogKind('marketplace', options)
}

function parseCatalogArgs(args) {
  const options = {
    json: false,
    kind: '',
    out: '',
    force: false
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--json') {
      options.json = true
      continue
    }

    if (arg === '--kind') {
      const kind = requireNextValue(args, index, '--kind')
      if (!Object.hasOwn(CATALOG_KINDS, kind)) {
        throw new Error(
          `Unknown catalog kind "${kind}". Use one of: ${CATALOG_KIND_IDS.join(', ')}`
        )
      }
      options.kind = kind
      index += 1
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

  if (options.kind && options.out) {
    throw new Error(
      'catalog --kind cannot be combined with --out (only the combined catalog is writable)'
    )
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
  tpan-opt-co-worker catalog [--kind <${CATALOG_KIND_IDS.join('|')}>] [--json] [--out catalog.json] [--force]

Options:
  --kind <id>   Print one slice of the catalog (${CATALOG_KIND_IDS.join(', ')}).
  --json        Print the catalog (or the selected --kind) as machine-readable JSON.
  --out <path>  Write the combined catalog JSON to a file. Not valid with --kind.
  --force       Overwrite an existing catalog file.
`)
}

function printJsonOnlyHelp(help) {
  console.log(`Usage:
  tpan-opt-co-worker ${help.command} [--json]

Alias for: tpan-opt-co-worker catalog --kind ${help.command}

Options:
  --json  ${help.jsonDescription}
`)
}

function printWritableJsonHelp(help) {
  console.log(`Usage:
  tpan-opt-co-worker ${help.command} [--json] [--out ${help.outExample || 'catalog.json'}] [--force]

Alias for: tpan-opt-co-worker catalog --kind ${help.command}

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
