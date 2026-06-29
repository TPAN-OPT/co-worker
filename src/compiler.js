import { GATE_PRESETS, createGatePresetRegistry, resolveGatePreset } from './gate-presets.js'
import { IDENTIFIER_PATTERN } from './identifier-pattern.js'
import {
  renderCatalogJson,
  renderCatalogScript,
  renderMarketplaceJson
} from './catalog-renderer.js'
import {
  renderClaudeAgentMarkdown,
  renderClaudeMarkdown
} from './claude-renderer.js'
import { renderGithubAction, renderGitlabCi } from './ci-renderer.js'
import { renderCursorRule } from './cursor-renderer.js'
import { renderMcpJson, workflowHasMcpServers } from './mcp-config-renderer.js'
import {
  renderClaudeSettings,
  renderHooksManifest,
  renderHooksMarkdown,
  workflowHasHooks
} from './hooks-renderer.js'
import { renderLocalRunnerScript } from './local-runner-renderer.js'
import { renderOrchestratorScript } from './orchestrator-renderer.js'
import { renderWorkflowManifest } from './manifest-renderer.js'
import { renderRunListScript } from './run-list-renderer.js'
import { renderWorkflowSchema } from './schema-renderer.js'
import { renderVerifyScript } from './verify-renderer.js'
import {
  renderOpenCodeAgentMarkdown,
  renderOpenCodeConfig
} from './opencode-renderer.js'
import { renderAgentsMarkdown, renderPullRequestTemplate } from './agents-renderer.js'
import { renderAgentToml, renderCodexConfig } from './codex-renderer.js'
import { renderWebConsole } from './web-console-renderer.js'

const WORKFLOW_FIELDS = [
  'name',
  'version',
  'organization',
  'mcpServers',
  'gatePresets',
  'roles',
  'stages',
  'hooks',
  'orchestration'
]
const ORGANIZATION_FIELDS = ['team', 'policies']
const ORCHESTRATION_FIELDS = ['agentCommand', 'agents']
const ROLE_FIELDS = ['description', 'skills', 'permissions', 'mcpServers']
const STAGE_FIELDS = ['id', 'owner', 'output', 'required', 'dependsOn', 'gates']
const GATE_FIELDS = ['id', 'type', 'preset', 'description', 'command']
const MCP_SERVER_FIELDS = ['command', 'args', 'env', 'url', 'transport', 'description']
const MCP_TRANSPORTS = ['stdio', 'sse', 'http']
const HOOK_FIELDS = ['id', 'event', 'command', 'matcher', 'description']
const HOOK_EVENTS = [
  'pre-tool',
  'post-tool',
  'stop',
  'user-prompt-submit',
  'session-start'
]

export function validateWorkflow(input) {
  if (!isPlainObject(input)) {
    throw new Error('Workflow must be a JSON object')
  }

  assertKnownFields(input, WORKFLOW_FIELDS, 'Workflow')
  const name = requireNonEmptyString(input.name, 'Workflow name')
  const version = requireNonEmptyString(input.version, 'Workflow version')
  const organization = normalizeOrganization(input.organization)
  const mcpServers = normalizeMcpServers(input.mcpServers)
  const roles = normalizeRoles(input.roles, new Set(Object.keys(mcpServers)))
  const gatePresetRegistry = createGatePresetRegistry(input.gatePresets)
  const gatePresets = getCustomGatePresets(gatePresetRegistry)
  const stages = normalizeStages(input.stages, roles, gatePresetRegistry)
  const hooks = normalizeHooks(input.hooks)
  const orchestration = normalizeOrchestration(input.orchestration, roles)

  return deepFreeze({
    name,
    version,
    ...(organization ? { organization } : {}),
    ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
    gatePresets,
    roles,
    stages,
    ...(hooks.length > 0 ? { hooks } : {}),
    ...(orchestration ? { orchestration } : {})
  })
}

// MCP servers are declared once at the workflow level and referenced by id from
// roles. A server is either a local stdio process (command + args) or a remote
// endpoint (url), never both, so the generated .mcp.json and Codex
// [mcp_servers.*] blocks always have an unambiguous transport.
function normalizeMcpServers(servers) {
  if (servers === undefined) {
    return {}
  }

  if (!isPlainObject(servers)) {
    throw new Error('Workflow mcpServers must be an object')
  }

  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => {
      validateIdentifier(name, `MCP server id "${name}"`)
      if (!isPlainObject(server)) {
        throw new Error(`MCP server "${name}" must be an object`)
      }

      assertKnownFields(server, MCP_SERVER_FIELDS, `MCP server "${name}"`)
      const hasCommand = server.command !== undefined
      const hasUrl = server.url !== undefined
      if (!hasCommand && !hasUrl) {
        throw new Error(`MCP server "${name}" must include a command or url`)
      }
      if (hasCommand && hasUrl) {
        throw new Error(`MCP server "${name}" must not set both command and url`)
      }

      const command = hasCommand
        ? requireNonEmptyString(server.command, `MCP server "${name}" command`)
        : ''
      const url = hasUrl
        ? requireNonEmptyString(server.url, `MCP server "${name}" url`)
        : ''
      const args = normalizeStringArray(server.args, `MCP server "${name}" args`, {
        optional: true
      })
      const env = normalizeEnvObject(server.env, `MCP server "${name}" env`)
      const transport =
        server.transport !== undefined
          ? normalizeEnum(server.transport, MCP_TRANSPORTS, `MCP server "${name}" transport`)
          : ''
      const description = optionalString(server.description)

      return [
        name,
        {
          ...(command ? { command } : {}),
          ...(args.length > 0 ? { args } : {}),
          ...(Object.keys(env).length > 0 ? { env } : {}),
          ...(url ? { url } : {}),
          ...(transport ? { transport } : {}),
          ...(description ? { description } : {})
        }
      ]
    })
  )
}

// Hooks are harness-neutral: each declares a lifecycle event from a fixed
// vocabulary and a shell command. Renderers map the neutral event onto each
// agent's native mechanism (for example Claude Code settings.json hook events)
// or surface it advisorily where an agent has no native hook system.
function normalizeHooks(hooks) {
  if (hooks === undefined) {
    return []
  }

  if (!Array.isArray(hooks)) {
    throw new Error('Workflow hooks must be an array')
  }

  const seenHookIds = new Set()
  return hooks.map((hook, index) => {
    const label = `Workflow hooks[${index}]`
    if (!isPlainObject(hook)) {
      throw new Error(`${label} must be an object`)
    }

    assertKnownFields(hook, HOOK_FIELDS, label)
    const id = requireNonEmptyString(hook.id, `${label} id`)
    validateIdentifier(id, `Hook "${id}"`)
    if (seenHookIds.has(id)) {
      throw new Error(`Duplicate hook id "${id}"`)
    }
    seenHookIds.add(id)

    const event = normalizeEnum(hook.event, HOOK_EVENTS, `Hook "${id}" event`)
    const command = requireNonEmptyString(hook.command, `Hook "${id}" command`)
    const matcher =
      hook.matcher !== undefined
        ? requireNonEmptyString(hook.matcher, `Hook "${id}" matcher`)
        : ''
    const description = optionalString(hook.description)

    return {
      id,
      event,
      command,
      ...(matcher ? { matcher } : {}),
      ...(description ? { description } : {})
    }
  })
}

// The orchestration block lets a workflow persist the harness-neutral agent
// command the orchestrator should run for --invoke, so operators no longer have
// to retype --agent-command on every run. `agentCommand` is the default for all
// stage owners; `agents` overrides it per role, which is how distinct owners can
// be driven by distinct agent CLIs from a single committed workflow.
function normalizeOrchestration(orchestration, roles) {
  if (orchestration === undefined) {
    return null
  }

  if (!isPlainObject(orchestration)) {
    throw new Error('Workflow orchestration must be an object')
  }

  assertKnownFields(orchestration, ORCHESTRATION_FIELDS, 'Workflow orchestration')

  const hasAgentCommand = orchestration.agentCommand !== undefined
  const agentCommand = hasAgentCommand
    ? requireNonEmptyString(orchestration.agentCommand, 'Workflow orchestration agentCommand')
    : ''
  const agents = normalizeOrchestrationAgents(orchestration.agents, roles)

  if (!hasAgentCommand && Object.keys(agents).length === 0) {
    throw new Error('Workflow orchestration must include agentCommand or agents')
  }

  return {
    ...(hasAgentCommand ? { agentCommand } : {}),
    ...(Object.keys(agents).length > 0 ? { agents } : {})
  }
}

function normalizeOrchestrationAgents(agents, roles) {
  if (agents === undefined) {
    return {}
  }

  if (!isPlainObject(agents)) {
    throw new Error('Workflow orchestration agents must be an object')
  }

  return Object.fromEntries(
    Object.entries(agents).map(([roleId, command]) => {
      if (!Object.hasOwn(roles, roleId)) {
        throw new Error(`Workflow orchestration agents references unknown role "${roleId}"`)
      }

      return [
        roleId,
        requireNonEmptyString(command, `Workflow orchestration agent command for "${roleId}"`)
      ]
    })
  )
}

function normalizeOrganization(organization) {
  if (organization === undefined) {
    return null
  }

  if (!isPlainObject(organization)) {
    throw new Error('Workflow organization must be an object')
  }

  assertKnownFields(organization, ORGANIZATION_FIELDS, 'Workflow organization')
  const hasTeam = organization.team !== undefined
  const team = hasTeam
    ? requireNonEmptyString(organization.team, 'Workflow organization team')
    : ''
  if (hasTeam) {
    validateIdentifier(team, `Workflow organization team "${team}"`)
  }
  const policies = normalizeStringArray(
    organization.policies,
    'Workflow organization policies',
    {
      optional: true
    }
  )

  if (!hasTeam && policies.length === 0) {
    throw new Error('Workflow organization must include a team or policies')
  }

  return {
    ...(hasTeam ? { team } : {}),
    policies
  }
}

export function compileWorkflow(input) {
  const workflow = validateWorkflow(input)
  const roleOutputs = Object.entries(workflow.roles).map(([roleId, role]) => ({
    path: `.codex/agents/${roleId}.toml`,
    content: renderAgentToml(roleId, role, workflow)
  }))
  const claudeRoleOutputs = Object.entries(workflow.roles).map(([roleId, role]) => ({
    path: `.claude/agents/${roleId}.md`,
    content: renderClaudeAgentMarkdown(roleId, role, workflow)
  }))
  const openCodeRoleOutputs = Object.entries(workflow.roles).map(([roleId, role]) => ({
    path: `.opencode/agents/${roleId}.md`,
    content: renderOpenCodeAgentMarkdown(roleId, role, workflow)
  }))

  const mcpOutputs = workflowHasMcpServers(workflow)
    ? [
        {
          path: '.mcp.json',
          content: renderMcpJson(workflow)
        }
      ]
    : []
  const hooksOutputs = workflowHasHooks(workflow)
    ? [
        {
          path: '.claude/settings.json',
          content: renderClaudeSettings(workflow)
        },
        {
          path: '.tpan-opt-co-worker/hooks.json',
          content: renderHooksManifest(workflow)
        }
      ]
    : []

  return [
    {
      path: 'AGENTS.md',
      content: renderAgentsMarkdown(workflow)
    },
    {
      path: 'CLAUDE.md',
      content: renderClaudeMarkdown(workflow)
    },
    {
      path: '.codex/config.toml',
      content: renderCodexConfig(workflow)
    },
    ...roleOutputs,
    ...claudeRoleOutputs,
    ...openCodeRoleOutputs,
    {
      path: '.cursor/rules/tpan-opt-co-worker.mdc',
      content: renderCursorRule(workflow)
    },
    {
      path: 'opencode.json',
      content: renderOpenCodeConfig()
    },
    ...mcpOutputs,
    ...hooksOutputs,
    {
      path: '.github/pull_request_template.md',
      content: renderPullRequestTemplate(workflow)
    },
    {
      path: '.github/workflows/tpan-opt-co-worker-verify.yml',
      content: renderGithubAction(workflow)
    },
    {
      path: '.gitlab-ci.yml',
      content: renderGitlabCi(workflow)
    },
    {
      path: '.tpan-opt-co-worker/workflow.manifest.json',
      content: renderWorkflowManifest(workflow)
    },
    {
      path: '.tpan-opt-co-worker/workflow.schema.json',
      content: renderWorkflowSchema()
    },
    {
      path: '.tpan-opt-co-worker/catalog.json',
      content: renderCatalogJson()
    },
    {
      path: '.tpan-opt-co-worker/marketplace.json',
      content: renderMarketplaceJson()
    },
    {
      path: '.tpan-opt-co-worker/console/catalog.js',
      content: renderCatalogScript()
    },
    {
      path: '.tpan-opt-co-worker/console/index.html',
      content: renderWebConsole(workflow)
    },
    {
      // Empty run history so the freshly generated console loads cleanly
      // before any verification run exists. The local runner overwrites both
      // files once runs are recorded.
      path: '.tpan-opt-co-worker/console/runs.js',
      content: renderEmptyRunsScript()
    },
    {
      path: '.tpan-opt-co-worker/console/runs.json',
      content: renderEmptyRunsData()
    },
    {
      // Empty orchestration state so the console loads cleanly before any
      // orchestrate-workflow run exists. The orchestrator overwrites both files
      // once a run records stage state.
      path: '.tpan-opt-co-worker/console/orchestration.js',
      content: renderEmptyOrchestrationScript()
    },
    {
      path: '.tpan-opt-co-worker/console/orchestration.json',
      content: renderEmptyOrchestrationData()
    },
    {
      path: 'scripts/run-workflow.mjs',
      content: renderLocalRunnerScript()
    },
    {
      path: 'scripts/list-runs.mjs',
      content: renderRunListScript()
    },
    {
      path: 'scripts/verify-workflow.mjs',
      content: renderVerifyScript(workflow)
    },
    {
      path: 'scripts/orchestrate-workflow.mjs',
      content: renderOrchestratorScript()
    }
  ]
}

const EMPTY_RUN_HISTORY = { runs: [], details: {} }

function renderEmptyRunsScript() {
  return `window.TPAN_OPT_RUNS = ${JSON.stringify(EMPTY_RUN_HISTORY, null, 2)}\n`
}

function renderEmptyRunsData() {
  return `${JSON.stringify(EMPTY_RUN_HISTORY, null, 2)}\n`
}

const EMPTY_ORCHESTRATION = { current: null }

function renderEmptyOrchestrationScript() {
  return `window.TPAN_OPT_ORCHESTRATION = ${JSON.stringify(EMPTY_ORCHESTRATION, null, 2)}\n`
}

function renderEmptyOrchestrationData() {
  return `${JSON.stringify(EMPTY_ORCHESTRATION, null, 2)}\n`
}

function normalizeRoles(roles, serverNames) {
  if (!isPlainObject(roles) || Object.keys(roles).length === 0) {
    throw new Error('Workflow roles must be a non-empty object')
  }

  return Object.fromEntries(
    Object.entries(roles).map(([roleId, role]) => {
      validateIdentifier(roleId, `Role id "${roleId}"`)
      if (!isPlainObject(role)) {
        throw new Error(`Role "${roleId}" must be an object`)
      }

      assertKnownFields(role, ROLE_FIELDS, `Role "${roleId}"`)
      const mcpServers = normalizeRoleMcpServers(role.mcpServers, roleId, serverNames)
      return [
        roleId,
        {
          description:
            typeof role.description === 'string' && role.description.trim() !== ''
              ? role.description.trim()
              : `Workflow role: ${roleId}`,
          skills: normalizeStringArray(role.skills, `Role "${roleId}" skills`),
          permissions: normalizeStringArray(role.permissions, `Role "${roleId}" permissions`),
          ...(mcpServers.length > 0 ? { mcpServers } : {})
        }
      ]
    })
  )
}

function normalizeRoleMcpServers(value, roleId, serverNames) {
  const names = normalizeStringArray(value, `Role "${roleId}" mcpServers`, {
    optional: true
  })

  const seen = new Set()
  for (const name of names) {
    if (!serverNames.has(name)) {
      throw new Error(
        `Role "${roleId}" mcpServers references unknown MCP server "${name}"`
      )
    }
    if (seen.has(name)) {
      throw new Error(`Role "${roleId}" mcpServers lists "${name}" more than once`)
    }
    seen.add(name)
  }

  return names
}

function normalizeStages(stages, roles, gatePresetRegistry) {
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new Error('Workflow stages must be a non-empty array')
  }

  const seenStageIds = new Set()
  let previousStageId = null
  return stages.map((stage) => {
    if (!isPlainObject(stage)) {
      throw new Error('Each workflow stage must be an object')
    }

    const id = requireNonEmptyString(stage.id, 'Stage id')
    validateIdentifier(id, `Stage id "${id}"`)
    assertKnownFields(stage, STAGE_FIELDS, `Stage "${id}"`)

    if (seenStageIds.has(id)) {
      throw new Error(`Duplicate stage id "${id}"`)
    }

    const owner = requireNonEmptyString(stage.owner, `Stage "${id}" owner`)
    if (!Object.hasOwn(roles, owner)) {
      throw new Error(`Stage "${id}" references unknown owner "${owner}"`)
    }

    const dependsOn = normalizeStageDependencies(stage.dependsOn, {
      stageId: id,
      knownStageIds: seenStageIds,
      previousStageId
    })

    seenStageIds.add(id)
    previousStageId = id

    return {
      id,
      owner,
      output:
        typeof stage.output === 'string' && stage.output.trim() !== ''
          ? stage.output.trim()
          : '',
      required: normalizeStringArray(stage.required, `Stage "${id}" required`, {
        optional: true
      }),
      dependsOn,
      gates: normalizeGates(
        stage.gates,
        `Stage "${id}" gates`,
        gatePresetRegistry,
        {
          optional: true
        }
      )
    }
  })
}

// Stage dependencies form the scheduling DAG. A stage may only depend on stages
// declared before it, which guarantees the workflow array is already a valid
// topological order and makes cycles impossible. When dependsOn is omitted the
// stage defaults to depending on the immediately preceding stage, so a plain
// list of stages stays strictly sequential (backward compatible). An explicit
// empty array opts a stage out of that default to run as an independent branch.
function normalizeStageDependencies(dependsOn, { stageId, knownStageIds, previousStageId }) {
  if (dependsOn === undefined) {
    return previousStageId ? [previousStageId] : []
  }

  const ids = normalizeStringArray(dependsOn, `Stage "${stageId}" dependsOn`, {
    optional: true
  })

  const seen = new Set()
  for (const depId of ids) {
    if (depId === stageId) {
      throw new Error(`Stage "${stageId}" cannot depend on itself`)
    }
    if (!knownStageIds.has(depId)) {
      throw new Error(
        `Stage "${stageId}" dependsOn references unknown or later stage "${depId}"`
      )
    }
    if (seen.has(depId)) {
      throw new Error(`Stage "${stageId}" dependsOn lists "${depId}" more than once`)
    }
    seen.add(depId)
  }

  return ids
}


function normalizeGates(value, label, gatePresetRegistry, options = {}) {
  if (value === undefined && options.optional) {
    return []
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }

  const seenGateIds = new Set()
  return value.map((gate, index) => {
    const normalizedGate = normalizeGate(gate, `${label}[${index}]`, gatePresetRegistry)

    if (seenGateIds.has(normalizedGate.id)) {
      throw new Error(`Duplicate gate id "${normalizedGate.id}"`)
    }
    seenGateIds.add(normalizedGate.id)

    return normalizedGate
  })
}

function normalizeGate(gate, label, gatePresetRegistry) {
  if (typeof gate === 'string') {
    const id = requireNonEmptyString(gate, label)
    validateIdentifier(id, `Gate "${id}"`)
    return {
      id,
      type: 'manual',
      description: '',
      command: ''
    }
  }

  if (!isPlainObject(gate)) {
    throw new Error(`${label} must be a string or gate object`)
  }

  assertKnownFields(gate, GATE_FIELDS, label)
  const id = requireNonEmptyString(gate.id, `${label} id`)
  validateIdentifier(id, `Gate "${id}"`)
  const presetId =
    typeof gate.preset === 'string' && gate.preset.trim() !== ''
      ? gate.preset.trim()
      : ''
  const preset = presetId ? resolveGatePreset(presetId, gatePresetRegistry) : null

  const type =
    typeof gate.type === 'string' && gate.type.trim() !== ''
      ? gate.type.trim()
      : preset?.type || 'manual'

  if (type !== 'manual' && type !== 'command') {
    throw new Error(`Gate "${id}" type must be "manual" or "command"`)
  }

  if (preset && type !== preset.type) {
    throw new Error(`Gate "${id}" type must match preset "${presetId}" type "${preset.type}"`)
  }

  const command =
    typeof gate.command === 'string' && gate.command.trim() !== ''
      ? gate.command.trim()
      : preset?.command || ''

  if (type === 'command' && command === '') {
    throw new Error(`Gate "${id}" command must be a non-empty string`)
  }

  return {
    id,
    type,
    ...(presetId ? { preset: presetId } : {}),
    description:
      typeof gate.description === 'string' && gate.description.trim() !== ''
        ? gate.description.trim()
        : preset?.description || '',
    command
  }
}

function getCustomGatePresets(gatePresetRegistry) {
  return Object.fromEntries(
    Object.entries(gatePresetRegistry).filter(
      ([presetId]) => !Object.hasOwn(GATE_PRESETS, presetId)
    )
  )
}

function normalizeStringArray(value, label, options = {}) {
  if (value === undefined && options.optional) {
    return []
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }

  return value.map((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(`${label}[${index}] must be a non-empty string`)
    }

    return item.trim()
  })
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`)
  }

  return value.trim()
}

function normalizeEnvObject(value, label) {
  if (value === undefined) {
    return {}
  }

  if (!isPlainObject(value)) {
    throw new Error(`${label} must be an object`)
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (typeof key !== 'string' || key.trim() === '') {
        throw new Error(`${label} keys must be non-empty strings`)
      }
      if (typeof item !== 'string') {
        throw new Error(`${label} value for "${key}" must be a string`)
      }

      return [key, item]
    })
  )
}

function normalizeEnum(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${label} must be one of ${allowed.join(', ')}`)
  }

  return value
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

function validateIdentifier(value, label) {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${label} must use letters, numbers, underscores, or hyphens`)
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertKnownFields(value, allowedFields, label) {
  for (const field of Object.keys(value)) {
    if (!allowedFields.includes(field)) {
      throw new Error(`${label} contains unknown field "${field}"`)
    }
  }
}

function deepFreeze(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) {
    return value
  }

  const frozenChildren = Array.isArray(value)
    ? value.map((item) => deepFreeze(item))
    : Object.fromEntries(
        Object.entries(value).map(([key, childValue]) => [key, deepFreeze(childValue)])
      )

  return Object.freeze(frozenChildren)
}
