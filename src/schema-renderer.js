import { IDENTIFIER_PATTERN_SOURCE } from './identifier-pattern.js'

export function renderWorkflowSchema() {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://tpan-opt-co-worker.local/workflow.schema.json',
    title: 'TPAN-OPT/CO-WORKER Workflow',
    type: 'object',
    additionalProperties: false,
    required: ['name', 'version', 'roles', 'stages'],
    properties: {
      name: nonEmptyString('Workflow name.'),
      version: nonEmptyString('Workflow version.'),
      organization: {
        type: 'object',
        additionalProperties: false,
        anyOf: [
          {
            required: ['team']
          },
          {
            required: ['policies'],
            properties: {
              policies: {
                ...stringArray(),
                minItems: 1
              }
            }
          }
        ],
        properties: {
          team: identifier('Reusable agent team id.'),
          policies: stringArray()
        }
      },
      mcpServers: {
        type: 'object',
        description:
          'MCP servers available to the workflow, keyed by server id. Reference them from roles via mcpServers.',
        additionalProperties: {
          $ref: '#/$defs/mcpServer'
        }
      },
      gatePresets: {
        type: 'object',
        additionalProperties: {
          $ref: '#/$defs/gatePreset'
        }
      },
      roles: {
        type: 'object',
        minProperties: 1,
        additionalProperties: {
          $ref: '#/$defs/role'
        }
      },
      stages: {
        type: 'array',
        minItems: 1,
        items: {
          $ref: '#/$defs/stage',
          required: ['id', 'owner']
        }
      },
      hooks: {
        type: 'array',
        description:
          'Harness-neutral lifecycle hooks compiled into each agent harness (for example Claude Code settings.json hook events).',
        items: {
          $ref: '#/$defs/hook'
        }
      },
      orchestration: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
          agentCommand: nonEmptyString(
            'Default --invoke agent command template ({stage}, {role}, {brief}).'
          ),
          agents: {
            type: 'object',
            additionalProperties: nonEmptyString(
              'Per-role agent command template that overrides agentCommand.'
            )
          }
        }
      }
    },
    $defs: {
      role: {
        type: 'object',
        additionalProperties: false,
        properties: {
          description: {
            type: 'string'
          },
          skills: stringArray(),
          permissions: stringArray(),
          mcpServers: {
            ...stringArray(),
            description: 'MCP server ids (declared in the top-level mcpServers map) this role may use.'
          }
        }
      },
      mcpServer: {
        type: 'object',
        additionalProperties: false,
        oneOf: [
          {
            required: ['command']
          },
          {
            required: ['url']
          }
        ],
        properties: {
          command: nonEmptyString('Executable for a local (stdio) MCP server.'),
          args: stringArray(),
          env: {
            type: 'object',
            additionalProperties: {
              type: 'string'
            }
          },
          url: nonEmptyString('Endpoint for a remote (sse/http) MCP server.'),
          transport: {
            type: 'string',
            enum: ['stdio', 'sse', 'http']
          },
          description: {
            type: 'string'
          }
        }
      },
      hook: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'event', 'command'],
        properties: {
          id: identifier('Hook id.'),
          event: {
            type: 'string',
            enum: ['pre-tool', 'post-tool', 'stop', 'user-prompt-submit', 'session-start']
          },
          command: nonEmptyString('Shell command to run for the hook.'),
          matcher: nonEmptyString('Tool matcher (applies to pre-tool/post-tool events).'),
          description: {
            type: 'string'
          }
        }
      },
      stage: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'owner'],
        properties: {
          id: identifier('Stage id.'),
          owner: identifier('Role id that owns the stage.'),
          output: {
            type: 'string'
          },
          required: stringArray(),
          dependsOn: {
            ...stringArray(),
            description:
              'Stage ids (declared earlier) that must be done before this stage starts. Omit for sequential default; use [] for an independent branch.'
          },
          gates: {
            type: 'array',
            items: {
              $ref: '#/$defs/gate'
            }
          }
        }
      },
      gate: {
        oneOf: [
          identifier('Manual gate id.'),
          {
            type: 'object',
            additionalProperties: false,
            required: ['id'],
            allOf: [
              {
                if: {
                  properties: {
                    type: {
                      const: 'command'
                    }
                  },
                  required: ['type']
                },
                then: {
                  anyOf: [
                    {
                      required: ['command']
                    },
                    {
                      required: ['preset']
                    }
                  ]
                }
              }
            ],
            properties: {
              id: identifier('Gate id.'),
              type: {
                type: 'string',
                enum: ['manual', 'command']
              },
              preset: nonEmptyString('Gate preset id.'),
              description: {
                type: 'string'
              },
              command: nonEmptyString('Command to run for command gates.')
            }
          }
        ],
        properties: {
          type: {
            enum: ['manual', 'command']
          }
        }
      },
      gatePreset: {
        type: 'object',
        additionalProperties: false,
        allOf: [
          {
            if: {
              properties: {
                type: {
                  const: 'command'
                }
              },
              required: ['type']
            },
            then: {
              required: ['command']
            }
          }
        ],
        properties: {
          type: {
            type: 'string',
            enum: ['manual', 'command']
          },
          description: {
            type: 'string'
          },
          command: nonEmptyString('Command to run for command presets.')
        }
      }
    }
  }

  return `${JSON.stringify(schema, null, 2)}\n`
}

function nonEmptyString(description) {
  return {
    type: 'string',
    minLength: 1,
    description
  }
}

function identifier(description) {
  return {
    type: 'string',
    pattern: IDENTIFIER_PATTERN_SOURCE,
    description
  }
}

function stringArray() {
  return {
    type: 'array',
    items: nonEmptyString('List item.'),
    default: []
  }
}
