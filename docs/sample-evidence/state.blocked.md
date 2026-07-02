# TPAN-OPT/CO-WORKER Orchestration State

- Workflow: opt-demo-workflow@1.0.0
- Run: local
- Status: blocked
- Current stages: `ship`
- startedAt: 2026-07-02T00:18:34.218Z
- finishedAt: 2026-07-02T00:18:35.188Z

## Stages

| Stage | Owner | Status | Depends on |
| --- | --- | --- | --- |
| clarify | planner | done | none |
| implement | engineer | done | `clarify` |
| review | reviewer | done | `implement` |
| ship | lead | current | `review` |

## Agent Invocations

| Stage | Role | Status | Exit |
| --- | --- | --- | --- |
| clarify | planner | completed | 0 |
| implement | engineer | completed | 0 |
| review | reviewer | completed | 0 |
| ship | lead | completed | 0 |

## Work Orders

### Work order: ship

- Stage: `ship`
- Owner: `lead`
- Output: `release_packet`
- Skills: `verification-loop`
- Permissions: `read_repo`, `write_docs`
- Required work: none
- Codex agent: .codex/agents/lead.toml
- Claude Code agent: .claude/agents/lead.md
- OpenCode agent: .opencode/agents/lead.md

### Pending Gates

| Gate | Type | Status | Next |
| --- | --- | --- | --- |
| human_approval | manual | pending | Attach approval evidence with a non-empty "approvedBy" field. |

### Next Action

Attach approval evidence for manual gate(s): human_approval.
