# Positioning & Roadmap

> How TPAN-OPT/CO-WORKER is positioned, who it is for, and how it is meant to grow.
> This is the "why" behind the [README](../README.md). Product marketing lives here so the README can stay task-focused.

## The one-line

**TPAN-OPT/CO-WORKER is the governance layer for AI agent output.**

Not another agent framework — a way to make the output of *any* agent (Claude Code, Codex, Cursor, your own harness) **auditable, reproducible, and trustworthy** through versioned workflows, real check gates, and an evidence trail.

## The category we compete in (and the one we don't)

| Lane | Examples | Our stance |
| --- | --- | --- |
| **Agent orchestration frameworks** (crowded) | CrewAI, LangGraph, AutoGen, Claude subagents | We do **not** try to out-orchestrate these. We are harness-neutral and delegate the reasoning to whatever agent you already use. |
| **Governance & evidence for AI output** (open lane) | — mostly empty | **This is us.** Gates, approvals, and an audit-ready evidence trail on top of agent work. See a [real committed sample](sample-evidence/). |

The pain we sell to is not "I want to wire up agents." It is: **"AI made my team faster, but now nobody can audit, reproduce, or trust what the agents shipped."** That pain grows with every agent added to a team.

## Who it's for — in sequence

We intentionally win one segment before reaching for the next. Positioning, features, and pricing follow this order.

### 1. Now — Solo builders & indie devs (the OPT wedge)
- **Who:** one person shipping like a team, using AI coding agents daily.
- **Value:** OPT — run a planner → engineer → reviewer → lead loop through a governed process; keep discipline without a team.
- **Why they adopt:** zero-friction MCP plugin, runs inside the agent they already live in, no infra.
- **Proof:** the [Hero demo](HERO-DEMO.md) — a bad change caught at a gate.

### 2. Next — Small teams that need process without bureaucracy
- **Who:** 3–15 person teams where AI writes a large share of code.
- **Value:** shared, versioned workflow; consistent gates across people and models; evidence per run.
- **Why they adopt:** output quality stops depending on who prompted what; onboarding a new dev (or a new agent) is "run the workflow."

### 3. Later — Orgs with compliance & audit requirements
- **Who:** regulated / enterprise teams shipping AI-assisted code.
- **Value:** the evidence trail becomes an audit artifact; policy packs enforce security/review/approval gates centrally.
- **Why they adopt:** they cannot let AI-speed delivery outrun their control and audit obligations.

## Value capture — OSS core, then a control plane

The open-source CLI/MCP core is the top of funnel and stays free (MIT). Sustainability comes from a hosted layer that the local tool naturally grows into:

1. **OSS core (now):** compiler, orchestrator, gates, evidence, MCP plugin. Free forever. Drives adoption and trust.
2. **Hosted control plane (next):** a dashboard aggregating runs, evidence, and gate history across repos and teammates; shareable audit views; run history that outlives a laptop. Team seat pricing.
3. **Enterprise (later):** SSO, centrally-managed policy packs, mandatory gates, retention/export for audit, on-prem. Contract pricing.

The line to hold: **the local developer experience is never paywalled.** Capture value on *aggregation, collaboration, and compliance* — never on the single-user loop.

## Messaging guardrails (do / don't)

- **Do** lead with the OPT wedge and the governance/evidence differentiator.
- **Do** show, don't tell — a real run with a gate failing beats a feature list.
- **Don't** call an offline placeholder run "real agent work." The default quickstart is a **dry-run preview**; real output requires `--real`. Overclaiming here is the fastest way to lose a developer audience's trust. See the honesty labeling in the [README quick start](../README.md#quick-start).
- **Don't** market capabilities that aren't shipped yet (hosted orchestration, marketplace install, YAML authoring) as if they exist. Roadmap ≠ product.

## Current scope vs direction

For an honest, precise statement of what ships today vs what is directional, see **Current Implementation Scope** in the [README](../README.md#current-implementation-scope). Keep that section and this file in sync: this doc says *why and for whom*; that section says *what runs today*.
