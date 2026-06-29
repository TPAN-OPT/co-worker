// Hooks are declared once in harness-neutral form (event + command) and mapped
// here onto each agent's native mechanism. Claude Code consumes settings.json
// hook events natively; the neutral manifest and AGENTS.md section carry the
// same hooks to harnesses without a native hook system. All outputs are emitted
// only when the workflow declares hooks, so default workflows are unchanged.

const CLAUDE_EVENT_BY_NEUTRAL_EVENT = {
  'pre-tool': 'PreToolUse',
  'post-tool': 'PostToolUse',
  stop: 'Stop',
  'user-prompt-submit': 'UserPromptSubmit',
  'session-start': 'SessionStart'
}

const NEUTRAL_EVENT_LABELS = {
  'pre-tool': 'Before a tool runs',
  'post-tool': 'After a tool runs',
  stop: 'When the agent stops',
  'user-prompt-submit': 'When a user prompt is submitted',
  'session-start': 'When a session starts'
}

export function workflowHasHooks(workflow) {
  return Boolean(workflow.hooks && workflow.hooks.length > 0)
}

// Claude Code settings.json: hooks grouped by native event, each entry an
// optional matcher plus a list of command hooks. Tool matchers only apply to
// PreToolUse/PostToolUse, so non-tool events omit the matcher entirely.
export function renderClaudeSettings(workflow) {
  const hooks = workflow.hooks || []
  const grouped = {}

  for (const hook of hooks) {
    const claudeEvent = CLAUDE_EVENT_BY_NEUTRAL_EVENT[hook.event]
    const isToolEvent = hook.event === 'pre-tool' || hook.event === 'post-tool'
    const entry = {
      ...(isToolEvent && hook.matcher ? { matcher: hook.matcher } : {}),
      hooks: [{ type: 'command', command: hook.command }]
    }

    grouped[claudeEvent] = [...(grouped[claudeEvent] || []), entry]
  }

  return `${JSON.stringify({ hooks: grouped }, null, 2)}\n`
}

// Harness-neutral manifest so non-Claude harnesses (and tooling) can read the
// same hooks without parsing a vendor-specific settings file.
export function renderHooksManifest(workflow) {
  const manifest = {
    schemaVersion: 'tpan-opt-co-worker.hooks/v1',
    workflow: {
      name: workflow.name,
      version: workflow.version
    },
    hooks: (workflow.hooks || []).map((hook) => ({
      id: hook.id,
      event: hook.event,
      command: hook.command,
      ...(hook.matcher ? { matcher: hook.matcher } : {}),
      ...(hook.description ? { description: hook.description } : {})
    })),
    harnesses: {
      claudeCode: {
        settings: '.claude/settings.json',
        native: true
      },
      generic: {
        manifest: '.tpan-opt-co-worker/hooks.json',
        native: false,
        guidance:
          'Harnesses without a native hook system should run these commands at the matching lifecycle event.'
      }
    }
  }

  return `${JSON.stringify(manifest, null, 2)}\n`
}

// Advisory section for AGENTS.md so harnesses without native hooks still surface
// the lifecycle commands to the operator.
export function renderHooksMarkdown(workflow) {
  if (!workflowHasHooks(workflow)) {
    return ''
  }

  const lines = workflow.hooks
    .map((hook) => {
      const when = NEUTRAL_EVENT_LABELS[hook.event] || hook.event
      const matcher = hook.matcher ? ` (matcher: \`${hook.matcher}\`)` : ''
      const description = hook.description ? ` — ${hook.description}` : ''
      return `- \`${hook.id}\` — ${when}${matcher}: \`${hook.command}\`${description}`
    })
    .join('\n')

  return `## Hooks

Claude Code consumes these via \`.claude/settings.json\`. Other harnesses should
run each command at the matching lifecycle event (see \`.tpan-opt-co-worker/hooks.json\`).

${lines}

`
}
