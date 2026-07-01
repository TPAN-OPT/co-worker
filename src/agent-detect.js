import { existsSync, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'

// The stable, agent-neutral seam the orchestrator gate checks accept: a real
// agent writes its stage result here and the same opt-demo gates cascade with
// zero demo code (see demo-agent-template.js). Keep this in sync with
// AGENT_ARTIFACT_DIR there.
const AGENT_ARTIFACT_PATH = '.tpan-opt-co-worker/artifacts/{stage}.md'

// Real code-agent CLIs the quickstart knows how to drive, in preference order.
// Each command template is substituted by the orchestrator with
// {stage}/{role}/{brief} and instructs the agent to write its finished result
// to the swap-seam path so the gates go green on real work, not a demo file.
const AGENT_COMMANDS = [
  {
    id: 'claude',
    bin: 'claude',
    command: `claude -p "You are the {role}. Complete stage {stage} using the brief at {brief}. Write your finished result to ${AGENT_ARTIFACT_PATH}"`
  },
  {
    id: 'codex',
    bin: 'codex',
    command: `codex exec "You are the {role}. Complete stage {stage} using the brief at {brief}. Write your finished result to ${AGENT_ARTIFACT_PATH}"`
  },
  {
    id: 'cursor-agent',
    bin: 'cursor-agent',
    command: `cursor-agent -p "You are the {role}. Complete stage {stage} using the brief at {brief}. Write your finished result to ${AGENT_ARTIFACT_PATH}"`
  }
]

// Probe PATH for an executable named `bin`. On Windows, honor PATHEXT so
// `claude` resolves `claude.cmd`/`claude.exe`. Pure filesystem lookup (no
// spawning) so it is fast and safe to run during quickstart.
function binOnPath(bin, env) {
  const pathValue = env.PATH || env.Path || ''
  const dirs = pathValue.split(delimiter).filter(Boolean)
  const isWindows = process.platform === 'win32'
  const extensions = isWindows
    ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : ['']

  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = join(dir, `${bin}${ext.toLowerCase()}`)
      const upper = join(dir, `${bin}${ext}`)
      const target = existsSync(candidate) ? candidate : existsSync(upper) ? upper : ''
      if (!target) {
        continue
      }
      try {
        const stat = statSync(target)
        if (stat.isFile() && (isWindows || (stat.mode & 0o111) !== 0)) {
          return true
        }
      } catch {
        // Unreadable entry; treat as absent and keep scanning.
      }
    }
  }
  return false
}

// Which known real-agent CLIs are installed, in preference order. Injecting
// `env` keeps this testable without mutating the real process environment.
export function detectAgents(env = process.env) {
  return AGENT_COMMANDS.filter((agent) => binOnPath(agent.bin, env)).map((agent) => agent.id)
}

// The persisted-style `--agent-command` string for a detected agent id, ready to
// hand to `orchestrate-workflow.mjs --invoke --agent-command`. Returns '' for an
// unknown id so callers can fall back cleanly.
export function realAgentCommand(agentId) {
  const agent = AGENT_COMMANDS.find((entry) => entry.id === agentId)
  return agent ? agent.command : ''
}

export function knownAgentIds() {
  return AGENT_COMMANDS.map((agent) => agent.id)
}
