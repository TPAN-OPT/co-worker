import { resolveGatePreset } from './gate-presets.js'
import {
  assertKnownFields,
  isPlainObject,
  normalizeStringArray,
  requireNonEmptyString,
  validateIdentifier
} from './workflow-validation.js'

const STAGE_FIELDS = [
  'id',
  'owner',
  'output',
  'required',
  'dependsOn',
  'gates',
  'skills',
  'mcpServers',
  'hooks',
  'nodes'
]
const NODE_FIELDS = ['id', 'owner', 'output', 'skills', 'mcpServers', 'hooks', 'gates']
const GATE_FIELDS = ['id', 'type', 'preset', 'description', 'command']

export function normalizeStages(stages, roles, gatePresetRegistry, references) {
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

    // Stage-scoped tooling sits alongside the owner role's tooling: skills are
    // free names (like role skills), while mcpServers and hooks reference ids
    // declared once at the workflow level so a stage cannot point at a server or
    // hook that does not exist.
    const skills = normalizeStringArray(stage.skills, `Stage "${id}" skills`, {
      optional: true
    })
    const mcpServers = normalizeReferencedIds(
      stage.mcpServers,
      references.serverNames,
      `Stage "${id}" mcpServers`,
      'MCP server'
    )
    const hooks = normalizeReferencedIds(
      stage.hooks,
      references.hookIds,
      `Stage "${id}" hooks`,
      'hook'
    )
    const nodes = normalizeNodes(stage.nodes, {
      stageId: id,
      stageOwner: owner,
      roles,
      gatePresetRegistry,
      references
    })
    const gates = normalizeGates(stage.gates, `Stage "${id}" gates`, gatePresetRegistry, {
      optional: true
    })
    // Gate ids must be unique across the whole stage — its own gates and every
    // node's gates — so the "<stageId>.<gateId>" evidence reference used by the
    // verifier and orchestrator never points at two different gates.
    assertUniqueStageGateIds(id, gates, nodes)

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
      gates,
      ...(skills.length > 0 ? { skills } : {}),
      ...(mcpServers.length > 0 ? { mcpServers } : {}),
      ...(hooks.length > 0 ? { hooks } : {}),
      ...(nodes.length > 0 ? { nodes } : {})
    }
  })
}

// A stage (大环节) may decompose into ordered sub-nodes (小节点) — for example an
// "AI test" stage holding unit, integration, and user-acceptance nodes. A node is
// a lighter sub-stage: it inherits the stage owner unless it names its own, and it
// may bind its own skills, MCP servers, hooks, and gates so tooling is scoped to
// the exact step that needs it instead of the whole stage or role.
function normalizeNodes(value, context) {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new Error(`Stage "${context.stageId}" nodes must be an array`)
  }

  const seenNodeIds = new Set()
  return value.map((node, index) => {
    const label = `Stage "${context.stageId}" nodes[${index}]`
    if (!isPlainObject(node)) {
      throw new Error(`${label} must be an object`)
    }

    assertKnownFields(node, NODE_FIELDS, label)
    const id = requireNonEmptyString(node.id, `${label} id`)
    validateIdentifier(id, `Node "${id}"`)
    if (seenNodeIds.has(id)) {
      throw new Error(`Stage "${context.stageId}" has duplicate node id "${id}"`)
    }
    seenNodeIds.add(id)

    const owner =
      node.owner !== undefined
        ? requireNonEmptyString(node.owner, `${label} owner`)
        : context.stageOwner
    if (!Object.hasOwn(context.roles, owner)) {
      throw new Error(`Node "${id}" references unknown owner "${owner}"`)
    }

    const skills = normalizeStringArray(node.skills, `${label} skills`, { optional: true })
    const mcpServers = normalizeReferencedIds(
      node.mcpServers,
      context.references.serverNames,
      `${label} mcpServers`,
      'MCP server'
    )
    const hooks = normalizeReferencedIds(
      node.hooks,
      context.references.hookIds,
      `${label} hooks`,
      'hook'
    )
    const gates = normalizeGates(node.gates, `${label} gates`, context.gatePresetRegistry, {
      optional: true
    })

    return {
      id,
      owner,
      ...(typeof node.output === 'string' && node.output.trim() !== ''
        ? { output: node.output.trim() }
        : {}),
      ...(skills.length > 0 ? { skills } : {}),
      ...(mcpServers.length > 0 ? { mcpServers } : {}),
      ...(hooks.length > 0 ? { hooks } : {}),
      ...(gates.length > 0 ? { gates } : {})
    }
  })
}

function assertUniqueStageGateIds(stageId, gates, nodes) {
  const seen = new Set()
  const allGateIds = [
    ...gates.map((gate) => gate.id),
    ...nodes.flatMap((node) => (node.gates || []).map((gate) => gate.id))
  ]
  for (const gateId of allGateIds) {
    if (seen.has(gateId)) {
      throw new Error(
        `Stage "${stageId}" has duplicate gate id "${gateId}" across its gates and nodes`
      )
    }
    seen.add(gateId)
  }
}

// Stage- and node-level mcpServers/hooks are id references into the maps declared
// once at the workflow level, so they validate the same way role mcpServers do:
// every id must exist and must not repeat.
function normalizeReferencedIds(value, knownIds, label, kind) {
  const ids = normalizeStringArray(value, label, { optional: true })
  const seen = new Set()
  for (const id of ids) {
    if (!knownIds.has(id)) {
      throw new Error(`${label} references unknown ${kind} "${id}"`)
    }
    if (seen.has(id)) {
      throw new Error(`${label} lists "${id}" more than once`)
    }
    seen.add(id)
  }
  return ids
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
