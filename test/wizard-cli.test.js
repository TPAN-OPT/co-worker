import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'

import { buildWizardWorkflow, runWizard } from '../src/wizard-commands.js'
import { validateWorkflow } from '../src/compiler.js'

// Feeds one line per event-loop tick. readline emits a 'line' event synchronously
// for every newline already in its buffer, so delivering all answers in a single
// chunk would fire every prompt's resolver at once and drop all but the first.
// Spacing the lines across ticks lets each rl.question() attach its listener
// before the next line arrives.
function scriptedInput(lines) {
  async function* generate() {
    for (const line of lines) {
      yield `${line}\n`
      await new Promise((resolve) => setImmediate(resolve))
    }
  }
  return Readable.from(generate())
}

function capturingOutput() {
  const chunks = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString())
      callback()
    }
  })
  stream.text = () => chunks.join('')
  return stream
}

describe('buildWizardWorkflow', () => {
  it('layers MCP servers, role assignments, and hooks onto the starter workflow', () => {
    const workflow = buildWizardWorkflow({
      name: 'wizard-flow',
      template: 'minimal',
      team: '',
      policyIds: [],
      mcpServers: {
        'co-worker': { command: 'node', args: ['src/cli.js', 'mcp'] }
      },
      roleMcp: { lead: ['co-worker'] },
      hooks: [{ id: 'preflight', event: 'pre-tool', command: 'node x.mjs', matcher: 'Bash' }]
    })

    assert.equal(workflow.name, 'wizard-flow')
    assert.deepEqual(workflow.mcpServers['co-worker'], {
      command: 'node',
      args: ['src/cli.js', 'mcp']
    })
    assert.deepEqual(workflow.roles.lead.mcpServers, ['co-worker'])
    assert.equal(workflow.hooks[0].id, 'preflight')

    // The assembled workflow must pass validation unchanged.
    const normalized = validateWorkflow(workflow)
    assert.equal(normalized.name, 'wizard-flow')
  })

  it('omits mcpServers and hooks when none were configured', () => {
    const workflow = buildWizardWorkflow({
      name: '',
      template: 'minimal',
      policyIds: []
    })

    assert.equal(Object.hasOwn(workflow, 'mcpServers'), false)
    assert.equal(Object.hasOwn(workflow, 'hooks'), false)
    assert.equal(Object.hasOwn(workflow, 'orchestration'), false)
    assert.equal(Object.hasOwn(workflow.roles.lead, 'mcpServers'), false)
  })

  it('commits an orchestration agent command when one is provided', () => {
    const workflow = buildWizardWorkflow({
      name: 'invoke-flow',
      template: 'minimal',
      policyIds: [],
      agentCommand: '  codex exec --brief {brief}  '
    })

    // Trimmed and validates as a real workflow.
    assert.equal(workflow.orchestration.agentCommand, 'codex exec --brief {brief}')
    assert.equal(validateWorkflow(workflow).name, 'invoke-flow')
  })
})

describe('runWizard interactive flow', () => {
  it('collects answers and compiles MCP and hook assets', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-wizard-'))
    const input = scriptedInput([
      'wizard-flow', // workflow name
      'minimal', // starter template
      '', // team (none)
      '', // policies (none)
      'y', // add an MCP server?
      'co-worker', // server id
      'local', // transport
      'node', // command
      'src/cli.js mcp', // args
      '', // env
      '', // description
      'n', // add another server?
      'co-worker', // assign to role lead
      'y', // add a hook?
      'preflight', // hook id
      'pre-tool', // event
      'node scripts/preflight.mjs', // command
      'Bash', // matcher
      '', // description
      'n', // add another hook?
      'claude -p "Do stage {stage} from {brief}"' // agent command for --invoke
    ])
    const output = capturingOutput()

    try {
      await runWizard({ argv: ['--out', targetDir, '--force'], input, output })

      const workflow = JSON.parse(
        await readFile(join(targetDir, 'opt.workflow.json'), 'utf8')
      )
      assert.equal(workflow.name, 'wizard-flow')
      assert.ok(workflow.mcpServers['co-worker'])
      assert.deepEqual(workflow.roles.lead.mcpServers, ['co-worker'])
      assert.equal(workflow.hooks[0].id, 'preflight')
      assert.equal(
        workflow.orchestration.agentCommand,
        'claude -p "Do stage {stage} from {brief}"'
      )

      const mcpJson = JSON.parse(await readFile(join(targetDir, '.mcp.json'), 'utf8'))
      assert.ok(mcpJson.mcpServers['co-worker'])

      const settings = JSON.parse(
        await readFile(join(targetDir, '.claude', 'settings.json'), 'utf8')
      )
      assert.equal(settings.hooks.PreToolUse[0].matcher, 'Bash')

      assert.match(output.text(), /Compiled \d+ harness assets/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('prints help without prompting when --help is passed', async () => {
    const output = capturingOutput()
    await runWizard({ argv: ['--help'], input: scriptedInput([]), output })
    assert.match(output.text(), /Interactively configure a workflow/)
  })
})
