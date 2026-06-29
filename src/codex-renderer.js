import { renderOrganizationInline } from './organization-renderer.js'
import { workflowHasMcpServers } from './mcp-config-renderer.js'

export function renderCodexConfig(workflow) {
  const agentSections = Object.entries(workflow.roles)
    .map(
      ([roleId, role]) => `[agents.${roleId}]
description = ${tomlString(role.description)}
config = ${tomlString(`.codex/agents/${roleId}.toml`)}
`
    )
    .join('\n')

  const mcpSection = renderCodexMcpSections(workflow)

  return `[features]
multi_agent = true

${agentSections}${mcpSection}`
}

// Codex reads MCP servers from [mcp_servers.<name>] tables. Local servers use
// command/args/env; remote servers use url. Only emitted when the workflow
// declares MCP servers so default configs are unchanged.
function renderCodexMcpSections(workflow) {
  if (!workflowHasMcpServers(workflow)) {
    return ''
  }

  return Object.entries(workflow.mcpServers)
    .map(([name, server]) => {
      const lines = [`[mcp_servers.${name}]`]
      if (server.url) {
        lines.push(`url = ${tomlString(server.url)}`)
      } else {
        lines.push(`command = ${tomlString(server.command)}`)
        if (server.args && server.args.length > 0) {
          lines.push(`args = ${tomlArray(server.args)}`)
        }
      }
      if (server.env && Object.keys(server.env).length > 0) {
        lines.push(`env = ${tomlInlineTable(server.env)}`)
      }
      return `\n${lines.join('\n')}\n`
    })
    .join('')
}

export function renderAgentToml(roleId, role, workflow) {
  const ownedStages = workflow.stages
    .filter((stage) => stage.owner === roleId)
    .map((stage) => stage.id)

  return `name = ${tomlString(roleId)}
description = ${tomlString(role.description)}
skills = ${tomlArray(role.skills)}
permissions = ${tomlArray(role.permissions)}
mcp_servers = ${tomlArray(role.mcpServers || [])}
owned_stages = ${tomlArray(ownedStages)}

[instructions]
summary = ${tomlString(
    `Act as ${roleId} for the ${workflow.name} workflow.${renderOrganizationInline(workflow.organization)} Produce required artifacts and stop when gates need human or reviewer evidence.`
  )}
`
}

function tomlArray(items) {
  return `[${items.map((item) => tomlString(item)).join(', ')}]`
}

function tomlInlineTable(record) {
  const entries = Object.entries(record).map(
    ([key, value]) => `${key} = ${tomlString(value)}`
  )
  return `{ ${entries.join(', ')} }`
}

function tomlString(value) {
  return JSON.stringify(value)
}
