import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { callTool, handleMessage, listTools } from '../src/mcp-server.js'

function text(result) {
  return result.content.map((part) => part.text).join('\n')
}

describe('MCP server protocol', () => {
  it('responds to initialize with server info and tool capability', async () => {
    const response = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    assert.equal(response.id, 1)
    assert.equal(response.result.serverInfo.name, 'tpan-opt-co-worker')
    assert.ok(response.result.capabilities.tools)
    assert.ok(response.result.protocolVersion)
  })

  it('lists the co-worker tools', async () => {
    const response = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const names = response.result.tools.map((tool) => tool.name)
    assert.deepEqual(
      names.sort(),
      [
        'co_worker_approve',
        'co_worker_catalog',
        'co_worker_compile',
        'co_worker_next',
        'co_worker_quickstart',
        'co_worker_validate'
      ]
    )
    for (const tool of listTools()) {
      assert.equal(tool.inputSchema.type, 'object')
    }
  })

  it('does not respond to notifications and rejects unknown methods', async () => {
    assert.equal(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }), null)
    const error = await handleMessage({ jsonrpc: '2.0', id: 3, method: 'no/such/method' })
    assert.equal(error.error.code, -32601)
  })
})

describe('MCP server tools', () => {
  it('validates inline workflow JSON and reports errors as tool errors', async () => {
    const valid = await callTool('co_worker_validate', {
      workflowJson: JSON.stringify({
        name: 'mcp-workflow',
        version: '1.0.0',
        roles: { lead: { skills: ['verification-loop'], permissions: ['read_repo'] } },
        stages: [{ id: 'plan', owner: 'lead', gates: [{ id: 'human_approval', type: 'manual' }] }]
      })
    })
    assert.ok(!valid.isError)
    assert.match(text(valid), /Valid: mcp-workflow@1\.0\.0/)

    const invalid = await callTool('co_worker_validate', { workflowJson: '{"name":"x"}' })
    assert.equal(invalid.isError, true)
  })

  it('lists the built-in catalog', async () => {
    const result = await callTool('co_worker_catalog', {})
    assert.match(text(result), /Workflow templates:/)
    assert.match(text(result), /production-feature/)
  })

  it('drives the full in-agent loop: quickstart, next, approve', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'tpan-opt-co-worker-mcp-'))

    try {
      const quickstart = await callTool('co_worker_quickstart', { out: targetDir, demo: false })
      assert.ok(!quickstart.isError)
      assert.match(text(quickstart), /Compiled \d+ harness assets/)
      await readFile(join(targetDir, 'opt.workflow.json'), 'utf8')

      // No demo run yet, so next reports nothing has run.
      const before = await callTool('co_worker_next', { out: targetDir })
      assert.match(text(before), /No orchestration run recorded yet/)

      // Approving the first stage's gate advances the orchestrator.
      const approve = await callTool('co_worker_approve', {
        out: targetDir,
        stage: 'plan',
        gate: 'scope_confirmed',
        approvedBy: 'lead@example.com'
      })
      assert.ok(!approve.isError)
      assert.match(text(approve), /Recorded approval for plan\.scope_confirmed/)
      assert.match(text(approve), /verify/)

      const after = await callTool('co_worker_next', { out: targetDir })
      assert.match(text(after), /Status: blocked/)
      assert.match(text(after), /verify/)
    } finally {
      await rm(targetDir, { recursive: true, force: true })
    }
  })
})
