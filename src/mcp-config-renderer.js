// Renders the Claude Code / generic .mcp.json from the workflow's mcpServers
// map. A server is either local (command + args + env) or remote (url, with a
// type taken from its transport). This is only emitted when the workflow
// declares at least one MCP server, so default workflows are unchanged.
export function renderMcpJson(workflow) {
  const servers = workflow.mcpServers || {}
  const mcpServers = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [name, renderMcpServer(server)])
  )

  return `${JSON.stringify({ mcpServers }, null, 2)}\n`
}

function renderMcpServer(server) {
  if (server.url) {
    return {
      type: server.transport || 'http',
      url: server.url
    }
  }

  return {
    command: server.command,
    ...(server.args && server.args.length > 0 ? { args: server.args } : {}),
    ...(server.env && Object.keys(server.env).length > 0 ? { env: server.env } : {})
  }
}

export function workflowHasMcpServers(workflow) {
  return Boolean(workflow.mcpServers && Object.keys(workflow.mcpServers).length > 0)
}
