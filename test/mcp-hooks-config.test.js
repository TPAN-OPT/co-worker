import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { compileWorkflow, validateWorkflow } from '../src/compiler.js'

const baseWorkflow = {
  name: 'mcp-hooks-workflow',
  version: '1.0.0',
  roles: {
    engineer: {
      description: 'Implements code with tests.',
      skills: ['tdd-workflow'],
      permissions: ['read_repo', 'write_code']
    }
  },
  stages: [
    {
      id: 'implement',
      owner: 'engineer',
      gates: ['unit_tests_pass']
    }
  ]
}

const mcpWorkflow = {
  ...baseWorkflow,
  mcpServers: {
    'co-worker': {
      command: 'node',
      args: ['src/cli.js', 'mcp'],
      env: { LOG_LEVEL: 'info' }
    },
    docs: {
      url: 'https://docs.example.com/sse',
      transport: 'sse',
      description: 'Remote documentation server.'
    }
  },
  roles: {
    engineer: {
      ...baseWorkflow.roles.engineer,
      mcpServers: ['co-worker', 'docs']
    }
  }
}

const hooksWorkflow = {
  ...baseWorkflow,
  hooks: [
    {
      id: 'preflight',
      event: 'pre-tool',
      matcher: 'Bash',
      command: 'node scripts/preflight.mjs',
      description: 'Guard shell commands.'
    },
    {
      id: 'record-stop',
      event: 'stop',
      command: 'node scripts/record.mjs'
    }
  ]
}

describe('validateWorkflow mcpServers', () => {
  it('normalizes command and url servers and role references', () => {
    const workflow = validateWorkflow(mcpWorkflow)
    assert.deepEqual(workflow.mcpServers['co-worker'], {
      command: 'node',
      args: ['src/cli.js', 'mcp'],
      env: { LOG_LEVEL: 'info' }
    })
    assert.deepEqual(workflow.mcpServers.docs, {
      url: 'https://docs.example.com/sse',
      transport: 'sse',
      description: 'Remote documentation server.'
    })
    assert.deepEqual(workflow.roles.engineer.mcpServers, ['co-worker', 'docs'])
  })

  it('omits mcpServers when none are declared', () => {
    const workflow = validateWorkflow(baseWorkflow)
    assert.equal(Object.hasOwn(workflow, 'mcpServers'), false)
    assert.equal(Object.hasOwn(workflow.roles.engineer, 'mcpServers'), false)
  })

  it('rejects malformed MCP servers and references', () => {
    const cases = [
      [{ ...baseWorkflow, mcpServers: [] }, /Workflow mcpServers must be an object/],
      [
        { ...baseWorkflow, mcpServers: { '1bad': { command: 'node' } } },
        /MCP server id "1bad" must use letters/
      ],
      [
        { ...baseWorkflow, mcpServers: { docs: {} } },
        /MCP server "docs" must include a command or url/
      ],
      [
        {
          ...baseWorkflow,
          mcpServers: { docs: { command: 'node', url: 'https://x' } }
        },
        /MCP server "docs" must not set both command and url/
      ],
      [
        { ...baseWorkflow, mcpServers: { docs: { command: 'node', tools: [] } } },
        /MCP server "docs" contains unknown field "tools"/
      ],
      [
        {
          ...baseWorkflow,
          mcpServers: { docs: { url: 'https://x', transport: 'grpc' } }
        },
        /MCP server "docs" transport must be one of/
      ],
      [
        {
          ...baseWorkflow,
          mcpServers: { docs: { command: 'node', env: { KEY: 1 } } }
        },
        /MCP server "docs" env value for "KEY" must be a string/
      ],
      [
        {
          ...baseWorkflow,
          roles: {
            engineer: { ...baseWorkflow.roles.engineer, mcpServers: ['missing'] }
          }
        },
        /Role "engineer" mcpServers references unknown MCP server "missing"/
      ],
      [
        {
          ...baseWorkflow,
          mcpServers: { docs: { url: 'https://x' } },
          roles: {
            engineer: { ...baseWorkflow.roles.engineer, mcpServers: ['docs', 'docs'] }
          }
        },
        /Role "engineer" mcpServers lists "docs" more than once/
      ]
    ]

    for (const [workflow, message] of cases) {
      assert.throws(() => validateWorkflow(workflow), message)
    }
  })
})

describe('validateWorkflow hooks', () => {
  it('normalizes hook events, matchers, and descriptions', () => {
    const workflow = validateWorkflow(hooksWorkflow)
    assert.deepEqual(workflow.hooks, [
      {
        id: 'preflight',
        event: 'pre-tool',
        command: 'node scripts/preflight.mjs',
        matcher: 'Bash',
        description: 'Guard shell commands.'
      },
      {
        id: 'record-stop',
        event: 'stop',
        command: 'node scripts/record.mjs'
      }
    ])
  })

  it('omits hooks when none are declared', () => {
    const workflow = validateWorkflow(baseWorkflow)
    assert.equal(Object.hasOwn(workflow, 'hooks'), false)
  })

  it('rejects malformed hooks', () => {
    const cases = [
      [{ ...baseWorkflow, hooks: {} }, /Workflow hooks must be an array/],
      [{ ...baseWorkflow, hooks: [null] }, /Workflow hooks\[0\] must be an object/],
      [
        { ...baseWorkflow, hooks: [{ id: 'h', event: 'pre-tool', command: 'x', tool: 'y' }] },
        /Workflow hooks\[0\] contains unknown field "tool"/
      ],
      [
        { ...baseWorkflow, hooks: [{ id: 'h', event: 'invalid', command: 'x' }] },
        /Hook "h" event must be one of/
      ],
      [
        { ...baseWorkflow, hooks: [{ id: 'h', event: 'stop' }] },
        /Hook "h" command must be a non-empty string/
      ],
      [
        {
          ...baseWorkflow,
          hooks: [
            { id: 'h', event: 'stop', command: 'x' },
            { id: 'h', event: 'pre-tool', command: 'y' }
          ]
        },
        /Duplicate hook id "h"/
      ]
    ]

    for (const [workflow, message] of cases) {
      assert.throws(() => validateWorkflow(workflow), message)
    }
  })
})

describe('compileWorkflow mcp and hooks outputs', () => {
  it('emits .mcp.json only when servers are declared', () => {
    const withServers = compileWorkflow(mcpWorkflow)
    const mcpJson = withServers.find((output) => output.path === '.mcp.json')
    assert.ok(mcpJson, 'expected .mcp.json output')
    const parsed = JSON.parse(mcpJson.content)
    assert.deepEqual(parsed.mcpServers['co-worker'], {
      command: 'node',
      args: ['src/cli.js', 'mcp'],
      env: { LOG_LEVEL: 'info' }
    })
    assert.deepEqual(parsed.mcpServers.docs, {
      type: 'sse',
      url: 'https://docs.example.com/sse'
    })

    const withoutServers = compileWorkflow(baseWorkflow)
    assert.equal(
      withoutServers.some((output) => output.path === '.mcp.json'),
      false
    )
  })

  it('emits Claude settings and a neutral hooks manifest only when hooks are declared', () => {
    const withHooks = compileWorkflow(hooksWorkflow)
    const settings = withHooks.find((output) => output.path === '.claude/settings.json')
    assert.ok(settings, 'expected .claude/settings.json output')
    const parsed = JSON.parse(settings.content)
    assert.equal(parsed.hooks.PreToolUse[0].matcher, 'Bash')
    assert.equal(
      parsed.hooks.PreToolUse[0].hooks[0].command,
      'node scripts/preflight.mjs'
    )
    assert.equal(parsed.hooks.Stop[0].hooks[0].command, 'node scripts/record.mjs')

    const manifest = withHooks.find(
      (output) => output.path === '.tpan-opt-co-worker/hooks.json'
    )
    assert.ok(manifest, 'expected neutral hooks manifest')

    const withoutHooks = compileWorkflow(baseWorkflow)
    assert.equal(
      withoutHooks.some((output) => output.path === '.claude/settings.json'),
      false
    )
  })
})
