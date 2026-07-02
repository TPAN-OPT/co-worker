# Sample evidence trail — what a governed run leaves behind

This is a **real, committed run** of the default OPT workflow so you can see the
audit trail *without installing or running anything*. It is the differentiator in
[POSITIONING.md](../POSITIONING.md#the-category-we-compete-in-and-the-one-we-dont)
made concrete: every stage, every gate, and the final human approval, on disk.

> Honesty note: this was produced by the bundled **offline demo agent** (a dry-run
> preview — labelled placeholders, not real work). The *structure* of the evidence
> is identical for a real agent run; only the artifact prose differs. Machine paths
> were normalized to `/path/to/your-repo`.

## Read it in two snapshots

### 1. Mid-run — [`state.blocked.md`](state.blocked.md) / [`state.blocked.json`](state.blocked.json)

Four agents (planner → engineer → reviewer → lead) each ran and **completed**
(`invocations`, exit `0`). Every **command gate** is `passed`. The run is
`status: "blocked"`, stopped at the one gate a machine must not auto-pass:

```json
{ "id": "human_approval", "type": "manual", "status": "pending" }
```

That is the whole pitch: **agents do the work; the run cannot advance past the
gate that matters until a human signs off.** A stub artifact would leave a command
gate `failed` here instead — see the [Hero demo](../HERO-DEMO.md).

### 2. After approval — [`state.completed.md`](state.completed.md) / [`state.completed.json`](state.completed.json)

A human approved, and the approval is **recorded as evidence** on the gate:

```json
"human_approval": {
  "type": "manual",
  "status": "passed",
  "evidence": { "approvedBy": "you@example.com" }
}
```

`status` is now `"completed"`. Who approved what, and when, is part of the run —
not a Slack message that scrolls away.

## The supporting files

- [`brief-ship.json`](brief-ship.json) — the exact, harness-neutral work order handed
  to the `lead` agent: its role, skills, permissions, pending gates, and the
  per-harness agent definitions (`.claude/…`, `.codex/…`, `.opencode/…`, `.cursor/…`).
- [`artifacts/ship.md`](artifacts/ship.md) — the artifact that turned the `ship`
  stage's command gate green.

Regenerate the whole thing yourself in ~2 seconds:

```bash
node src/cli.js quickstart --out ./demo --force   # from this tool's directory
```
