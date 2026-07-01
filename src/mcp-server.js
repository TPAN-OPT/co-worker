import { createInterface } from 'node:readline'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import pkg from '../package.json' with { type: 'json' }
import {
  SELECTABLE_HARNESSES,
  compileWorkflow,
  parseHarnessSelection,
  validateWorkflow
} from './compiler.js'
import { writeCompiledOutputs } from './file-system.js'
import { quickstartProject } from './init-commands.js'
import { approveGate, nextWorkOrder } from './ops-commands.js'
import { createCatalog } from './catalog-renderer.js'
import { stageGates } from './stage-gates.js'

// Hand-written, zero-dependency Model Context Protocol server. MCP's stdio
// transport is newline-delimited JSON-RPC 2.0, so the whole server is a read
// loop over stdin that dispatches `initialize`, `tools/list`, and `tools/call`.
// The same binary is what installs into Claude Code (as a plugin MCP server),
// Codex (config.toml mcp_servers), and any MCP-capable agent, keeping the tool
// harness-neutral by construction.
const PROTOCOL_VERSION = '2024-11-05'
const SERVER_NAME = 'tpan-opt-co-worker'
const SERVER_VERSION = pkg.version

const TOOLS = [
  {
    name: 'co_worker_quickstart',
    description:
      'Scaffold a workflow, compile every harness asset, and (by default) seed a demo orchestration so the static console is immediately populated. The fastest path from zero to a working repository.',
    inputSchema: {
      type: 'object',
      properties: {
        out: { type: 'string', description: 'Target repository directory.' },
        name: { type: 'string', description: 'Workflow name. Optional.' },
        template: {
          type: 'string',
          enum: ['opt-demo', 'production-feature', 'minimal'],
          description: 'Workflow template. Defaults to opt-demo (runnable agent team).'
        },
        demo: {
          type: 'boolean',
          description: 'Run the demo orchestration. Defaults to true.'
        },
        real: {
          type: 'boolean',
          description:
            'Drive an installed agent CLI (claude, codex, cursor-agent) for real work instead of the offline demo. Falls back to the demo when none is on PATH. Defaults to false.'
        },
        agent: {
          type: 'string',
          enum: ['claude', 'codex', 'cursor-agent'],
          description: 'Which detected agent to use with real mode. Implies real=true.'
        }
      },
      required: ['out']
    }
  },
  {
    name: 'co_worker_compile',
    description:
      'Compile a workflow JSON file into repository harness assets (CLAUDE.md, .codex, .cursor, opencode.json, CI, scripts, console).',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: { type: 'string', description: 'Path to opt.workflow.json.' },
        out: { type: 'string', description: 'Target repository directory.' },
        harness: {
          type: 'array',
          items: { type: 'string', enum: SELECTABLE_HARNESSES },
          description:
            'Only emit files for these harnesses. Core assets (manifest, schema, console, scripts, CI) are always written. Omit to emit every harness (opt mode) or just the team playbook (team mode).'
        }
      },
      required: ['workflow', 'out']
    }
  },
  {
    name: 'co_worker_validate',
    description:
      'Validate a workflow definition (by path or inline JSON) against the structural rules without writing files.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: { type: 'string', description: 'Path to a workflow JSON file.' },
        workflowJson: { type: 'string', description: 'Inline workflow JSON string.' }
      }
    }
  },
  {
    name: 'co_worker_catalog',
    description:
      'List the built-in catalog: workflow templates, organization policy packs, reusable agent teams, and marketplace packages.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'co_worker_next',
    description:
      'Report the current orchestration state for a compiled repository: status, current stages, and the open work order(s) with the next action.',
    inputSchema: {
      type: 'object',
      properties: {
        out: { type: 'string', description: 'Compiled repository directory.' }
      },
      required: ['out']
    }
  },
  {
    name: 'co_worker_approve',
    description:
      'Approve a manual gate by recording approver evidence, then advance the orchestrator and report the new status. Replaces hand-editing manual-evidence.json.',
    inputSchema: {
      type: 'object',
      properties: {
        out: { type: 'string', description: 'Compiled repository directory.' },
        gate: { type: 'string', description: 'Manual gate id to approve.' },
        stage: { type: 'string', description: 'Stage id that owns the gate. Optional but recommended.' },
        approvedBy: { type: 'string', description: 'Who approved (recorded as evidence).' },
        note: { type: 'string', description: 'Optional approval note.' },
        runId: { type: 'string', description: 'Orchestration run id. Defaults to local.' }
      },
      required: ['out', 'gate', 'approvedBy']
    }
  }
]

const TOOL_HANDLERS = {
  co_worker_quickstart: quickstartTool,
  co_worker_compile: compileTool,
  co_worker_validate: validateTool,
  co_worker_catalog: catalogTool,
  co_worker_next: nextTool,
  co_worker_approve: approveTool
}

export function listTools() {
  return TOOLS
}

export async function callTool(name, args) {
  const handler = TOOL_HANDLERS[name]
  if (!handler) {
    return errorResult(`Unknown tool: ${name}`)
  }

  try {
    return await handler(args || {})
  } catch (error) {
    return errorResult(`Error: ${error.message}`)
  }
}

export async function handleMessage(message) {
  if (!message || typeof message !== 'object') {
    return null
  }

  const { id, method, params } = message

  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
    })
  }

  if (method === 'tools/list') {
    return ok(id, { tools: listTools() })
  }

  if (method === 'tools/call') {
    const result = await callTool(params?.name, params?.arguments || {})
    return ok(id, result)
  }

  if (method === 'ping') {
    return ok(id, {})
  }

  // Notifications carry no id and expect no response.
  if (typeof method === 'string' && method.startsWith('notifications/')) {
    return null
  }

  if (id === undefined || id === null) {
    return null
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } }
}

export async function runMcpServer({ input = process.stdin, output = process.stdout } = {}) {
  const rl = createInterface({ input, crlfDelay: Infinity })
  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    let message
    try {
      message = JSON.parse(trimmed)
    } catch {
      continue
    }

    const response = await handleMessage(message)
    if (response) {
      output.write(`${JSON.stringify(response)}\n`)
    }
  }
}

async function quickstartTool(args) {
  requireString(args.out, 'out')
  const result = await quickstartProject({
    out: args.out,
    name: typeof args.name === 'string' ? args.name : '',
    template: typeof args.template === 'string' ? args.template : 'opt-demo',
    templateSpecified: typeof args.template === 'string',
    team: '',
    policyIds: [],
    force: true,
    demo: args.demo !== false,
    real: args.real === true || typeof args.agent === 'string',
    agent: typeof args.agent === 'string' ? args.agent : '',
    runId: 'local',
    runIdSpecified: false
  })

  const consolePath = resolve(result.targetDir, '.tpan-opt-co-worker', 'console', 'index.html')
  const lines = [
    `Scaffolded ${result.workflowPath} from template ${result.template}.`,
    `Compiled ${result.assetCount} harness assets into ${result.targetDir}.`
  ]
  if (result.demo && result.demo.ran && result.demo.drove) {
    lines.push(
      result.demo.real
        ? `Drove the ${result.demo.agentId} agent team end to end (run "${result.demo.runId}") for REAL work: each owner agent produced an artifact and the run is blocked on one human approval.`
        : `Drove the OFFLINE demo agent team end to end (run "${result.demo.runId}"): placeholder artifacts, not real work; the run is blocked on one human approval.`
    )
    if (result.demo.approveGate) {
      const stageFlag = result.demo.approveStage ? ` stage ${result.demo.approveStage}` : ''
      lines.push(
        `Finish it: call co_worker_approve for gate ${result.demo.approveGate}${stageFlag}, approved by you.`
      )
    }
  } else if (result.demo && result.demo.ran && result.demo.stalled) {
    const who = result.demo.agentId ? `The ${result.demo.agentId} agent run` : 'The run'
    const where = result.demo.stalledStage && result.demo.stalledStage !== 'unknown' ? ` at stage "${result.demo.stalledStage}"` : ''
    lines.push(`${who} did not complete every stage${where}: a command gate is still open (no artifact with real content). Open the console to see where it stopped.`)
  } else if (result.demo && result.demo.ran) {
    lines.push(`Seeded demo orchestration run "${result.demo.runId}".`)
  }
  lines.push(`Open the console: ${consolePath}`)
  return textResult(lines.join('\n'))
}

async function compileTool(args) {
  requireString(args.workflow, 'workflow')
  requireString(args.out, 'out')
  const harnesses = resolveHarnessArg(args.harness)
  const workflow = JSON.parse(await readFile(resolve(args.workflow), 'utf8'))
  const outputs = compileWorkflow(workflow, { harnesses })
  const result = await writeCompiledOutputs(outputs, resolve(args.out), { force: true })
  return textResult(`Compiled ${result.written.length} files into ${resolve(args.out)}.`)
}

// The MCP harness argument accepts an array of harness ids (matching the CLI's
// --harness) or a single comma-separated string. Validate through the same
// helper the CLI uses so an unknown harness fails loudly instead of silently
// emitting only the core assets.
function resolveHarnessArg(harness) {
  if (harness === undefined || harness === null) {
    return []
  }
  const entries = Array.isArray(harness) ? harness : [harness]
  return entries.flatMap((entry) => parseHarnessSelection(String(entry)))
}

async function validateTool(args) {
  const source = await readWorkflowSource(args)
  const workflow = validateWorkflow(source)
  const gates = workflow.stages.reduce((total, stage) => total + stageGates(stage).length, 0)
  return textResult(
    [
      `Valid: ${workflow.name}@${workflow.version}`,
      `Roles: ${Object.keys(workflow.roles).length}`,
      `Stages: ${workflow.stages.length}`,
      `Gates: ${gates}`
    ].join('\n')
  )
}

function catalogTool() {
  const catalog = createCatalog()
  const section = (title, items) =>
    `${title}:\n${items.map((item) => `- ${item.id}: ${item.description || item.name || ''}`).join('\n')}`
  return textResult(
    [
      section('Workflow templates', catalog.templates),
      section('Policy packs', catalog.policies),
      section('Reusable teams', catalog.teams),
      section('Marketplace packages', catalog.marketplace)
    ].join('\n\n')
  )
}

async function nextTool(args) {
  requireString(args.out, 'out')
  const result = await nextWorkOrder(args.out)
  return textResult(result.text)
}

async function approveTool(args) {
  requireString(args.out, 'out')
  requireString(args.gate, 'gate')
  requireString(args.approvedBy, 'approvedBy')

  const result = await approveGate({
    out: args.out,
    gate: args.gate,
    stage: typeof args.stage === 'string' ? args.stage : '',
    approvedBy: args.approvedBy,
    note: typeof args.note === 'string' ? args.note : '',
    runId: typeof args.runId === 'string' && args.runId ? args.runId : 'local'
  })
  return textResult(result.text)
}

async function readWorkflowSource(args) {
  if (typeof args.workflowJson === 'string' && args.workflowJson.trim() !== '') {
    return JSON.parse(args.workflowJson)
  }
  if (typeof args.workflow === 'string' && args.workflow.trim() !== '') {
    return JSON.parse(await readFile(resolve(args.workflow), 'utf8'))
  }
  throw new Error('Provide a workflow path or workflowJson.')
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required argument "${name}".`)
  }
}

function ok(id, result) {
  return { jsonrpc: '2.0', id, result }
}

function textResult(text) {
  return { content: [{ type: 'text', text }] }
}

function errorResult(text) {
  return { content: [{ type: 'text', text }], isError: true }
}
