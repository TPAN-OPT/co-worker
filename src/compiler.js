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
import {
  renderOrganizationInline,
  renderOrganizationMarkdown
} from './organization-renderer.js'
import { renderWebConsole } from './web-console-renderer.js'

const WORKFLOW_FIELDS = ['name', 'version', 'organization', 'gatePresets', 'roles', 'stages']
const ORGANIZATION_FIELDS = ['team', 'policies']
const ROLE_FIELDS = ['description', 'skills', 'permissions']
const STAGE_FIELDS = ['id', 'owner', 'output', 'required', 'gates']
const GATE_FIELDS = ['id', 'type', 'preset', 'description', 'command']

export function validateWorkflow(input) {
  if (!isPlainObject(input)) {
    throw new Error('Workflow must be a JSON object')
  }

  assertKnownFields(input, WORKFLOW_FIELDS, 'Workflow')
  const name = requireNonEmptyString(input.name, 'Workflow name')
  const version = requireNonEmptyString(input.version, 'Workflow version')
  const organization = normalizeOrganization(input.organization)
  const roles = normalizeRoles(input.roles)
  const gatePresetRegistry = createGatePresetRegistry(input.gatePresets)
  const gatePresets = getCustomGatePresets(gatePresetRegistry)
  const stages = normalizeStages(input.stages, roles, gatePresetRegistry)

  return deepFreeze({
    name,
    version,
    ...(organization ? { organization } : {}),
    gatePresets,
    roles,
    stages
  })
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

function normalizeRoles(roles) {
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
      return [
        roleId,
        {
          description:
            typeof role.description === 'string' && role.description.trim() !== ''
              ? role.description.trim()
              : `Workflow role: ${roleId}`,
          skills: normalizeStringArray(role.skills, `Role "${roleId}" skills`),
          permissions: normalizeStringArray(role.permissions, `Role "${roleId}" permissions`)
        }
      ]
    })
  )
}

function normalizeStages(stages, roles, gatePresetRegistry) {
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new Error('Workflow stages must be a non-empty array')
  }

  const seenStageIds = new Set()
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
    seenStageIds.add(id)

    const owner = requireNonEmptyString(stage.owner, `Stage "${id}" owner`)
    if (!Object.hasOwn(roles, owner)) {
      throw new Error(`Stage "${id}" references unknown owner "${owner}"`)
    }

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

function renderAgentsMarkdown(workflow) {
  const organizationSection = renderOrganizationMarkdown(workflow.organization)
  const roleSections = Object.entries(workflow.roles)
    .map(
      ([roleId, role]) => `### ${roleId}

${role.description}

- Skills: ${formatInlineList(role.skills)}
- Permissions: ${formatInlineList(role.permissions)}`
    )
    .join('\n\n')

  const stageSections = workflow.stages
    .map(
      (stage, index) => `### ${index + 1}. ${stage.id}

- Owner: \`${stage.owner}\`
- Output: ${stage.output ? `\`${stage.output}\`` : 'none'}
- Required work: ${formatInlineList(stage.required)}
- Gates: ${formatGateList(stage.gates)}`
    )
    .join('\n\n')

  return `# ${workflow.name} Agent Instructions

This file was generated by TPAN-OPT/CO-WORKER from workflow version \`${workflow.version}\`.

## Operating Rules

- Follow the workflow stages in order unless a human lead explicitly approves a deviation.
- Do not proceed past a gate without verification evidence.
- Keep role boundaries clear: each role should only use the permissions granted below.
- Human approval is required for external writes, credential changes, paid actions, destructive operations, and releases.
- Record durable artifacts for plans, implementation notes, reviews, verification results, and approvals.

${organizationSection}
## Roles

${roleSections}

## Workflow Stages

${stageSections}
`
}

function renderCodexConfig(workflow) {
  const agentSections = Object.entries(workflow.roles)
    .map(
      ([roleId, role]) => `[agents.${roleId}]
description = ${tomlString(role.description)}
config = ${tomlString(`.codex/agents/${roleId}.toml`)}
`
    )
    .join('\n')

  return `[features]
multi_agent = true

${agentSections}`
}

function renderAgentToml(roleId, role, workflow) {
  const ownedStages = workflow.stages
    .filter((stage) => stage.owner === roleId)
    .map((stage) => stage.id)

  return `name = ${tomlString(roleId)}
description = ${tomlString(role.description)}
skills = ${tomlArray(role.skills)}
permissions = ${tomlArray(role.permissions)}
owned_stages = ${tomlArray(ownedStages)}

[instructions]
summary = ${tomlString(
    `Act as ${roleId} for the ${workflow.name} workflow.${renderOrganizationInline(workflow.organization)} Produce required artifacts and stop when gates need human or reviewer evidence.`
  )}
`
}

function renderPullRequestTemplate(workflow) {
  const gateItems = workflow.stages
    .flatMap((stage) =>
      stage.gates.map(
        (gate) =>
          `- [ ] \`${stage.id}\`: ${gate.id} (${gate.type})${gate.command ? ` - \`${gate.command}\`` : ''}`
      )
    )
    .join('\n')

  return `## Summary

<!-- Describe the change and the workflow stage completed. -->

## Workflow

- Workflow: \`${workflow.name}\`
- Version: \`${workflow.version}\`

## Verification Gates

${gateItems || '- [ ] No workflow gates configured.'}

## Evidence

<!-- Link tests, screenshots, logs, reviews, approvals, and generated artifacts. -->

## Risk Notes

<!-- Call out security, migration, data, release, or rollback concerns. -->
`
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

function validateIdentifier(value, label) {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${label} must use letters, numbers, underscores, or hyphens`)
  }
}

function formatInlineList(items) {
  return items.length === 0 ? 'none' : items.map((item) => `\`${item}\``).join(', ')
}

function formatGateList(gates) {
  if (gates.length === 0) {
    return 'none'
  }

  return gates
    .map((gate) => {
      const command = gate.command ? `: \`${gate.command}\`` : ''
      return `\`${gate.id}\` (${gate.type})${command}`
    })
    .join(', ')
}

function tomlArray(items) {
  return `[${items.map((item) => tomlString(item)).join(', ')}]`
}

function tomlString(value) {
  return JSON.stringify(value)
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
