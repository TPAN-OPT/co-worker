import { createInterface } from 'node:readline/promises'
import { resolve } from 'node:path'

import { compileWorkflow } from './compiler.js'
import { writeCompiledOutputs } from './file-system.js'
import { buildStarterWorkflow } from './init-commands.js'
import { listReusableAgentTeams } from './agent-team-catalog.js'
import { listOrganizationPolicyPacks } from './policy-catalog.js'
import { listWorkflowTemplates } from './workflow-template.js'

const HOOK_EVENT_CHOICES = [
  { id: 'pre-tool', label: 'Before a tool runs (pre-tool)' },
  { id: 'post-tool', label: 'After a tool runs (post-tool)' },
  { id: 'stop', label: 'When the agent stops (stop)' },
  { id: 'user-prompt-submit', label: 'When a user prompt is submitted (user-prompt-submit)' },
  { id: 'session-start', label: 'When a session starts (session-start)' }
]

// Pure assembler: takes the answers the wizard collected and produces the final
// workflow object. It layers the interactively configured MCP servers, role
// assignments, and hooks on top of the same starter workflow that `init`
// produces, so team/policy behavior stays identical to the flag-driven path.
export function buildWizardWorkflow(answers) {
  const base = buildStarterWorkflow({
    out: '.',
    name: answers.name || '',
    template: answers.template,
    templateSpecified: true,
    team: answers.team || '',
    policyIds: answers.policyIds || [],
    force: false
  }).workflow

  const mcpServers = answers.mcpServers || {}
  const roleMcp = answers.roleMcp || {}
  const hooks = answers.hooks || []

  const roles = Object.fromEntries(
    Object.entries(base.roles).map(([roleId, role]) => {
      const assigned = roleMcp[roleId] || []
      return [roleId, assigned.length > 0 ? { ...role, mcpServers: assigned } : role]
    })
  )

  return {
    ...base,
    ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
    roles,
    ...(hooks.length > 0 ? { hooks } : {})
  }
}

export async function runWizard({
  argv = [],
  input = process.stdin,
  output = process.stdout
} = {}) {
  const options = parseWizardArgs(argv)
  if (options.help) {
    printWizardHelp(output)
    return
  }

  const rl = createInterface({ input, output })
  try {
    const answers = await collectWizardAnswers(rl, output)
    const workflow = buildWizardWorkflow(answers)
    const targetDir = resolve(options.out)

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

    write(output, '')
    write(output, `Wrote ${workflowResult.written[0]}`)
    write(output, `Compiled ${compileResult.written.length} harness assets into ${targetDir}`)
    printWizardSummary(output, workflow)
  } finally {
    rl.close()
  }
}

async function collectWizardAnswers(rl, output) {
  write(output, 'TPAN-OPT/CO-WORKER workflow wizard')
  write(output, 'Answer the prompts; press Enter to accept the [default].')
  write(output, '')

  const name = await askText(rl, 'Workflow name', '')
  const template = await askChoice(
    rl,
    'Starter template',
    listWorkflowTemplates().map((item) => ({ id: item.id, label: item.name })),
    'minimal'
  )
  const team = await askOptionalChoice(
    rl,
    'Reusable agent team',
    listReusableAgentTeams().map((item) => ({ id: item.id, label: item.name }))
  )
  const policyIds = await askMultiChoice(
    rl,
    'Organization policy packs',
    listOrganizationPolicyPacks().map((item) => ({ id: item.id, label: item.name }))
  )

  const mcpServers = await collectMcpServers(rl, output)
  const roleMcp = await collectRoleMcpAssignments(rl, output, template, team, policyIds, mcpServers)
  const hooks = await collectHooks(rl, output)

  return { name, template, team, policyIds, mcpServers, roleMcp, hooks }
}

// Loops until the operator declines to add another MCP server. Each server is
// either local (command + args + env) or remote (url + transport).
async function collectMcpServers(rl, output) {
  const servers = {}
  write(output, '')
  while (await askYesNo(rl, 'Add an MCP server?', false)) {
    const name = await askText(rl, '  Server id', '')
    if (!name) {
      write(output, '  Skipped: a server id is required.')
      continue
    }

    const kind = await askChoice(
      rl,
      '  Transport',
      [
        { id: 'local', label: 'Local process (command)' },
        { id: 'remote', label: 'Remote endpoint (url)' }
      ],
      'local'
    )

    const server = {}
    if (kind === 'remote') {
      server.url = await askText(rl, '  Endpoint url', '')
      const transport = await askText(rl, '  Transport (sse/http)', 'http')
      if (transport) {
        server.transport = transport
      }
    } else {
      server.command = await askText(rl, '  Command', 'node')
      const args = await askText(rl, '  Args (space separated)', '')
      const argList = args.split(/\s+/).filter(Boolean)
      if (argList.length > 0) {
        server.args = argList
      }
      const env = parseEnvPairs(await askText(rl, '  Env (KEY=VALUE, comma separated)', ''))
      if (Object.keys(env).length > 0) {
        server.env = env
      }
    }

    const description = await askText(rl, '  Description (optional)', '')
    if (description) {
      server.description = description
    }

    servers[name] = server
  }

  return servers
}

// Once servers exist, assign them per role. The roles come from the starter
// workflow, so we build it up front (without writing anything) to know the role
// ids the operator is assigning to.
async function collectRoleMcpAssignments(rl, output, template, team, policyIds, mcpServers) {
  const serverNames = Object.keys(mcpServers)
  if (serverNames.length === 0) {
    return {}
  }

  const base = buildStarterWorkflow({
    out: '.',
    name: '',
    template,
    templateSpecified: true,
    team: team || '',
    policyIds,
    force: false
  }).workflow

  const serverChoices = serverNames.map((id) => ({ id, label: id }))
  const roleMcp = {}
  write(output, '')
  write(output, 'Assign MCP servers to roles (leave blank to skip a role):')
  for (const roleId of Object.keys(base.roles)) {
    const selected = await askMultiChoice(rl, `  Role ${roleId}`, serverChoices)
    if (selected.length > 0) {
      roleMcp[roleId] = selected
    }
  }

  return roleMcp
}

// Loops until the operator declines to add another hook. Matchers only apply to
// tool events, so they are only prompted for pre-tool/post-tool.
async function collectHooks(rl, output) {
  const hooks = []
  write(output, '')
  while (await askYesNo(rl, 'Add a hook?', false)) {
    const id = await askText(rl, '  Hook id', '')
    if (!id) {
      write(output, '  Skipped: a hook id is required.')
      continue
    }

    const event = await askChoice(rl, '  Event', HOOK_EVENT_CHOICES, 'pre-tool')
    const command = await askText(rl, '  Command', '')
    const hook = { id, event, command }

    if (event === 'pre-tool' || event === 'post-tool') {
      const matcher = await askText(rl, '  Tool matcher (optional)', '')
      if (matcher) {
        hook.matcher = matcher
      }
    }

    const description = await askText(rl, '  Description (optional)', '')
    if (description) {
      hook.description = description
    }

    hooks.push(hook)
  }

  return hooks
}

function parseEnvPairs(value) {
  const env = {}
  for (const pair of value.split(',')) {
    const trimmed = pair.trim()
    if (!trimmed) {
      continue
    }
    const eq = trimmed.indexOf('=')
    if (eq <= 0) {
      continue
    }
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

async function askText(rl, prompt, defaultValue) {
  const suffix = defaultValue ? ` [${defaultValue}]` : ''
  const answer = (await rl.question(`${prompt}${suffix}: `)).trim()
  return answer || defaultValue
}

async function askYesNo(rl, prompt, defaultValue) {
  const suffix = defaultValue ? ' [Y/n]' : ' [y/N]'
  const answer = (await rl.question(`${prompt}${suffix}: `)).trim().toLowerCase()
  if (!answer) {
    return defaultValue
  }
  return answer === 'y' || answer === 'yes'
}

async function askChoice(rl, prompt, choices, defaultId) {
  printChoices(rl, prompt, choices)
  const answer = (await rl.question(`Select [${defaultId}]: `)).trim()
  return resolveChoice(answer, choices, defaultId)
}

async function askOptionalChoice(rl, prompt, choices) {
  printChoices(rl, `${prompt} (optional)`, choices)
  const answer = (await rl.question('Select (blank for none): ')).trim()
  if (!answer) {
    return ''
  }
  return resolveChoice(answer, choices, '')
}

async function askMultiChoice(rl, prompt, choices) {
  printChoices(rl, `${prompt} (comma separated)`, choices)
  const answer = (await rl.question('Select (blank for none): ')).trim()
  if (!answer) {
    return []
  }

  const selected = []
  for (const token of answer.split(',')) {
    const id = resolveChoice(token.trim(), choices, '')
    if (id && !selected.includes(id)) {
      selected.push(id)
    }
  }
  return selected
}

function printChoices(rl, prompt, choices) {
  rl.output.write(`${prompt}:\n`)
  choices.forEach((choice, index) => {
    rl.output.write(`  ${index + 1}. ${choice.label} (${choice.id})\n`)
  })
}

// Accepts either the 1-based number from the printed list or the choice id
// itself, so operators can type whichever is faster.
function resolveChoice(answer, choices, defaultId) {
  if (!answer) {
    return defaultId
  }

  const asNumber = Number.parseInt(answer, 10)
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= choices.length) {
    return choices[asNumber - 1].id
  }

  const match = choices.find((choice) => choice.id === answer)
  return match ? match.id : defaultId
}

function parseWizardArgs(argv) {
  const options = { out: '.', force: false, help: false }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--out') {
      options.out = requireNextValue(argv, index, '--out')
      index += 1
      continue
    }
    if (arg === '--force') {
      options.force = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    throw new Error(`Unknown wizard option "${arg}"`)
  }

  return options
}

function requireNextValue(args, index, name) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }
  return value
}

function printWizardSummary(output, workflow) {
  write(output, '')
  write(output, 'Next steps:')
  write(output, '  1. Review opt.workflow.json and the generated harness assets.')
  if (workflow.mcpServers) {
    write(output, '  2. Confirm .mcp.json and .codex/config.toml MCP wiring.')
  }
  if (workflow.hooks) {
    write(output, '  3. Confirm .claude/settings.json hooks before relying on them.')
  }
  write(
    output,
    '  4. Re-apply after edits: tpan-opt-co-worker compile --workflow opt.workflow.json --out . --force'
  )
}

function printWizardHelp(output) {
  write(
    output,
    `Usage:
  tpan-opt-co-worker wizard [--out .] [--force]

Interactively configure a workflow — template, team, policies, MCP servers,
and lifecycle hooks — then write opt.workflow.json and compile every harness
asset.

Options:
  --out <dir>  Output repository directory. Defaults to current directory.
  --force      Overwrite existing files in the output directory.`
  )
}

function write(output, line) {
  output.write(`${line}\n`)
}
