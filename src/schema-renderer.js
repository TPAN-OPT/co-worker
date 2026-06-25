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
          permissions: stringArray()
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
