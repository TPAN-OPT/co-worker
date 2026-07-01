# TPAN-OPT/CO-WORKER

> **Language:** English | [简体中文](README.zh-CN.md)

TPAN-OPT/CO-WORKER is an AI-native team operating system for designing, distributing, and verifying standardized workflows across humans, code agents, repositories, and automation harnesses.

It is built for teams that want the speed of AI-assisted delivery without losing process discipline, engineering standards, security review, or proof of quality. It also supports **OPT**, or **One Person Team**, where one human lead coordinates a team of specialized AI agents to complete work that previously required a larger human team.

## Why This Exists

AI coding tools make individuals faster, but many teams still run into the same problems:

- Collaboration becomes fragmented across chats, agents, repositories, and tools.
- Output quality varies by prompt, model, person, or local environment.
- Team standards live in documents but are not enforced during execution.
- Agent work is hard to audit, reproduce, or verify.
- Smaller teams are expected to carry the workload of larger teams.

TPAN-OPT/CO-WORKER turns a team's operating method into a versioned, executable workflow.

## Current Implementation Scope

The current package is a no-dependency Node.js workflow compiler, local verifier, local runner, stage-gated execution orchestrator, and static workflow console. It validates JSON workflow definitions, generates repository-local harness assets, runs staged verification gates, advances a stage-by-stage state machine that stops at the first unsatisfied gate and emits a work order, records evidence, and syncs local run history into the generated console.

The broader team operating system language in this README describes the product direction. The execution orchestrator routes and gates work along a stage dependency graph — scheduling independent branches across owners in parallel — and can drive a stage's owner agent through an opt-in, harness-neutral `--invoke`/`--agent-command` adapter, but it does not yet execute gates concurrently or coordinate agents fully autonomously. Hosted orchestration, marketplace package installation, and YAML authoring are not part of the current package yet.

## What TPAN-OPT/CO-WORKER Provides

- **Workflow Designer**: define standard delivery workflows with stages, roles, gates, artifacts, and approvals.
- **Agent Team Builder**: create specialized agent roles such as planner, architect, engineer, reviewer, security reviewer, QA, release manager, and documentation owner.
- **Skill / MCP / Hook Registry**: connect standard or custom skills, MCP servers, hooks, checks, templates, and automation policies.
- **Harness Adapter Layer**: distribute the same workflow to Codex, Claude Code, Cursor, OpenCode, GitHub Actions, local runners, or custom agent harnesses.
- **Verification Gates**: require tests, linting, type checks, coverage, E2E validation, security review, documentation review, and human approval before work advances.
- **Evidence Trail**: keep artifacts, decisions, test results, review findings, screenshots, logs, and approvals attached to each workflow run.
- **OPT Runtime**: allow one person to manage a virtual team of specialized agents with clear boundaries and explicit approval points.

## Quick Start

If you already work inside a code agent (Claude Code, Codex, Cursor, …), the shortest path is to **install co-worker as a plugin and never leave your agent**. If you want a plain terminal flow or to script it, use the CLI directly (Option B). Either way you need Node.js 22+.

### Option A — Install as a plugin (recommended for agent users)

co-worker ships a zero-dependency MCP server that exposes the whole flow as callable tools, so your agent can scaffold, inspect, drive, and approve a governed workflow without you touching a terminal.

**Claude Code** — install straight from the repo:

```text
/plugin marketplace add https://github.com/TPAN-OPT/co-worker
/plugin install tpan-opt-co-worker@tpan-opt-co-worker
```

This clones the repo and registers the `co-worker` MCP server automatically (via `.mcp.json`) — no npm install, no manual config. Now just talk to your agent; the whole point — one lead running a team of agents through a governed process — shows up in three turns:

1. **Scaffold and run the team** — "Use `co_worker_quickstart` to set up a workflow in `./my-repo`." It scaffolds `opt.workflow.json`, compiles every harness asset, and drives a real four-role agent team (planner → engineer → reviewer → lead) end to end with a bundled offline demo agent. Each agent does its stage and writes an artifact; the run stops at a single human-approval gate.
2. **See what the team did** — open the printed `./my-repo/.tpan-opt-co-worker/console/index.html`. The console shows every stage `done`, the populated agent-invocation log, and one open work order: your approval. The artifacts the agents wrote are under `./my-repo/.tpan-opt-co-worker/demo/artifacts/`.
3. **Approve to ship** — "Call `co_worker_approve` for gate `human_approval` in stage `ship`, approved by me, on `./my-repo`." It records your approval as evidence, advances the orchestrator, and the run is `done`.

That is the OPT loop in miniature: agents do the work, a human approves the gate that matters.

**Run the same flow with a real agent.** If you have an agent CLI installed (`claude`, `codex`, or `cursor-agent`), add `--real` — quickstart detects it and drives the real agent instead of the offline demo, so the four stages produce real work at `.tpan-opt-co-worker/artifacts/<stage>.md` and still stop at the one human gate:

```bash
tpan-opt-co-worker quickstart --out . --real --force
tpan-opt-co-worker approve human_approval --stage ship --by you --run-id real
```

Pick a specific agent with `--agent codex`. If no supported agent is on PATH, quickstart says so and runs the offline demo instead; the default run always labels its artifacts as an offline placeholder, so you can tell a demo from real work. Under the hood `--real` is just the orchestrator's agent-neutral `--invoke`/`--agent-command` adapter — the stage gates pass once an artifact with real content exists, no matter who wrote it, so you can also drive it by hand:

```bash
node scripts/orchestrate-workflow.mjs --run-id real --invoke --loop \
  --agent-command 'claude -p "You are the {role}. Do stage {stage} from brief {brief}. Write your result to .tpan-opt-co-worker/artifacts/{stage}.md"'
```

Swap `claude -p` for `codex exec`, `cursor-agent`, or any agent CLI — the orchestrator substitutes `{stage}` / `{role}` / `{brief}` / `{skills}` / `{mcpServers}` / `{hooks}` and runs it once per ready stage. Commit the command into the workflow under `orchestration.agentCommand` (the `wizard` prompts for it) so `--invoke` needs no flags on later runs.

**Codex / Cursor / other MCP agents** — clone the repo, then point the agent at the local server. See [Install as a plugin (MCP)](#install-as-a-plugin-mcp) for the exact `config.toml` / JSON, then ask the agent to run the same `co_worker_quickstart` → `co_worker_approve` chain.

### Option B — Use the CLI directly

The quick start is a single command — from an empty directory to a real agent-team run:

```bash
node src/cli.js quickstart --out /path/to/target-repo --name my-workflow
```

It scaffolds `opt.workflow.json`, compiles every harness asset, bundles an offline demo agent, and drives a four-role team (planner → engineer → reviewer → lead) end to end: each agent does its stage and writes an artifact, and the run stops at one human-approval gate. It opens the console for you (use `--no-open` to skip), or open the path it prints:

```bash
open /path/to/target-repo/.tpan-opt-co-worker/console/index.html
```

The console shows every stage `done`, the populated agent-invocation log, and one open work order — your approval — so you see a team of agents actually deliver work before learning any other command. This default run uses the bundled **offline demo agent** — its artifacts (under `.tpan-opt-co-worker/demo/artifacts/`) are labelled placeholders, not real work. Add `--real` to drive an installed agent CLI (`claude`/`codex`/`cursor-agent`) for real output instead; if the command detects an agent on your PATH it also prints the exact one-flag line to re-run for real. Add `--no-demo` to scaffold without running the team, or `--template production-feature` for a delivery workflow with real check gates.

Everything the agents could do is done; one human approval is left. Finish it with a single command (the same core as the `co_worker_approve` MCP tool, so CLI and in-agent flows behave identically):

```bash
node src/cli.js approve human_approval --stage ship --by you@example.com --out /path/to/target-repo
```

`approve` records the approver as evidence and advances the orchestrator to `done`. To inspect a run at any time, `node src/cli.js status --out …` shows where each stage stands and `node src/cli.js next --out …` returns the open work order(s) and next action.

To change the workflow, edit it in the console Designer (or `opt.workflow.json`) and re-apply:

```bash
node src/cli.js compile --workflow /path/to/target-repo/opt.workflow.json --out /path/to/target-repo --force
```

### See each capability in action

The quickstart repo already contains a working example of everything in the "What TPAN-OPT/CO-WORKER Provides" list above. Run the `node src/cli.js …` commands from this tool's directory, and the `node scripts/…` commands from inside the generated target repo:

- **Workflow Designer** — edit stages, roles, gates, and approvals in the console Designer panel or `opt.workflow.json`, then check it: `node src/cli.js validate --workflow /path/to/target-repo/opt.workflow.json`.
- **Agent Team Builder** — each role compiles to a per-harness agent file (`.claude/agents/<role>.md`, `.codex/agents/<role>.toml`, `.opencode/agents/<role>.md`); browse reusable teams with `node src/cli.js teams`.
- **Skill / MCP / Hook registry** — `node src/cli.js catalog` lists templates, policy packs, and teams; `node src/cli.js marketplace` lists skills, MCP servers, and hooks; `node src/cli.js presets` lists gate presets.
- **Harness adapter layer** — one workflow fans out to every harness; see the generated files with `ls .codex .claude .cursor opencode.json .github/workflows scripts`.
- **Quality gates** — `node scripts/verify-workflow.mjs` runs the stage gates and stops at the first failing or unmet one.
- **Evidence chain** — `node scripts/run-workflow.mjs --run-id local` records `.tpan-opt-co-worker/runs/local/evidence.json` and `summary.md`.
- **OPT Runtime** — `node src/cli.js status` / `next` / `approve` route stages across owners, emit the next work order, and advance gates from the command line (this drives the orchestration the quickstart demo seeded; `node scripts/orchestrate-workflow.mjs --run-id local` is the underlying script).

### More commands (reference)

The commands below give finer control over the same pipeline; the full surface is documented under [Current CLI](#current-cli). To develop this repository itself, run `npm test`.

Interactively configure a workflow — template, team, policies, MCP servers, and lifecycle hooks — then write `opt.workflow.json` and compile every harness asset in one pass:

```bash
node src/cli.js wizard --out /path/to/target-repo
```

The wizard prompts for the starter template, an optional reusable team, organization policy packs, any MCP servers (local `command` + `args` + `env`, or remote `url` + transport), which roles each server is assigned to, and any lifecycle hooks (`pre-tool`, `post-tool`, `stop`, `user-prompt-submit`, `session-start`, with an optional tool matcher). It then compiles `.mcp.json`, `.codex/config.toml` MCP wiring, and `.claude/settings.json` hooks alongside the usual harness assets. See [Workflow nodes: MCP servers and hooks](#workflow-nodes-mcp-servers-and-hooks) for the schema the wizard produces.

Create a starter workflow in a target repository without compiling or running a demo:

```bash
node src/cli.js init --out /path/to/target-repo --name production-feature-workflow
```

List the combined built-in catalog before initializing a workflow:

```bash
node src/cli.js catalog
node src/cli.js catalog --json
node src/cli.js catalog --out catalog.json
```

List built-in workflow templates:

```bash
node src/cli.js templates
node src/cli.js templates --json
```

List built-in organization policy packs:

```bash
node src/cli.js policies
node src/cli.js policies --json
```

List reusable agent teams:

```bash
node src/cli.js teams
node src/cli.js teams --json
```

Create a starter workflow from a reusable team recommendation:

```bash
node src/cli.js init \
  --out /path/to/target-repo \
  --team product-delivery \
  --policy security-baseline \
  --name production-feature-workflow
```

Create a starter workflow with explicit organization policies:

```bash
node src/cli.js init \
  --out /path/to/target-repo \
  --policy quality-standard \
  --policy security-baseline \
  --name production-feature-workflow
```

Create a starter workflow from a named template:

```bash
node src/cli.js init \
  --out /path/to/target-repo \
  --template production-feature \
  --name production-feature-workflow
```

Create a language-neutral starter workflow that does not assume npm scripts:

```bash
node src/cli.js init \
  --out /path/to/target-repo \
  --template minimal \
  --name minimal-evidence-workflow
```

Validate a workflow before generating repository assets:

```bash
node src/cli.js validate --workflow /path/to/target-repo/opt.workflow.json
```

Print a machine-readable validation summary:

```bash
node src/cli.js validate --workflow /path/to/target-repo/opt.workflow.json --json
```

Print or write the workflow JSON Schema:

```bash
node src/cli.js schema --out /path/to/target-repo/workflow.schema.json
```

List built-in gate presets before designing an organization workflow:

```bash
node src/cli.js presets
node src/cli.js presets --json
```

Preview generated repository assets:

```bash
node src/cli.js compile \
  --workflow /path/to/target-repo/opt.workflow.json \
  --out /tmp/tpan-opt-co-worker-demo \
  --dry-run
```

Generate assets into a target repository:

```bash
node src/cli.js compile \
  --workflow /path/to/target-repo/opt.workflow.json \
  --out /path/to/target-repo
```

Generate assets with an external preset registry:

```bash
node src/cli.js compile \
  --workflow examples/opt.workflow.json \
  --preset-file examples/gate-presets.json \
  --out /path/to/target-repo
```

Overwrite previously generated files:

```bash
node src/cli.js compile --workflow examples/opt.workflow.json --out /path/to/target-repo --force
```

The compiler currently reads JSON workflow files. YAML support is planned.

Open the generated static workflow console. It shows the workflow overview and an editable Workflow Designer panel (with in-browser draft validation and JSON export) immediately, then displays run summary, filterable run history with evidence artifact links, and status-filtered gate details with command exit codes and manual evidence metadata after local workflow runs have produced `.tpan-opt-co-worker/console/runs.json` and `.tpan-opt-co-worker/console/runs.js`.

```bash
open /path/to/target-repo/.tpan-opt-co-worker/console/index.html
```

Run generated verification checks inside a compiled target repository:

```bash
node scripts/verify-workflow.mjs
```

Write a structured workflow evidence report:

```bash
node scripts/verify-workflow.mjs --report .tpan-opt-co-worker/evidence.json
```

Attach manual approvals or review evidence:

```bash
node scripts/verify-workflow.mjs \
  --manual-evidence examples/manual-evidence.json \
  --report .tpan-opt-co-worker/evidence.json
```

Create a full workflow run artifact directory:

```bash
node scripts/verify-workflow.mjs \
  --manual-evidence examples/manual-evidence.json \
  --run-dir .tpan-opt-co-worker/runs/feature-001
```

The run directory contains:

- `evidence.json`: machine-readable gate results.
- `summary.md`: human-readable workflow evidence summary.

## Install as a plugin (MCP)

co-worker ships a zero-dependency MCP server (`tpan-opt-co-worker mcp`, newline-delimited JSON-RPC over stdio) that exposes its capabilities as callable tools — `co_worker_quickstart`, `co_worker_compile`, `co_worker_validate`, `co_worker_catalog`, `co_worker_next`, and `co_worker_approve` — so any MCP-capable code agent can scaffold, configure, drive, and approve workflows from inside the agent.

**Claude Code** — install as a plugin:

```text
/plugin marketplace add https://github.com/TPAN-OPT/co-worker
/plugin install tpan-opt-co-worker@tpan-opt-co-worker
```

The plugin registers the `co-worker` MCP server (via `.mcp.json`) automatically.

**Codex** — clone the repo first, then point `~/.codex/config.toml` at the local server:

```toml
[mcp_servers.co-worker]
command = "node"
args = ["/absolute/path/to/co-worker/src/cli.js", "mcp"]
```

**Other MCP-capable agents (Cursor, domestic code agents, custom runners)** — point them at the same local server:

```json
{
  "mcpServers": {
    "co-worker": {
      "command": "node",
      "args": ["/absolute/path/to/co-worker/src/cli.js", "mcp"]
    }
  }
}
```

> The package is not published to npm yet. Once it is, the Codex and generic configs above can use `command: "npx"`, `args: ["-y", "tpan-opt-co-worker", "mcp"]` instead of an absolute clone path. The Claude Code plugin path needs no npm publish — it installs straight from the repo.

Then, from inside the agent, ask it to run `co_worker_quickstart` to scaffold a populated console, `co_worker_next` to see the open work order, and `co_worker_approve` to sign off a manual gate and advance — no hand-edited evidence files. Agents that only read repository files still work through the generated `CLAUDE.md`, `.codex/`, `.cursor/`, and `opencode.json` assets.

## Core Concept

Most AI tools focus on helping an agent complete a task.

TPAN-OPT/CO-WORKER focuses on helping a team repeatedly produce verified work.

```text
Team Standard
  -> Workflow Template
  -> Agent Roles + Skills + MCP + Hooks
  -> Repository / Harness Distribution
  -> Workflow Run
  -> Verified Artifacts
  -> Review, Approval, Release
```

### Two modes: one workflow, two ways to hand it out

You design **one** workflow — stages, sub-nodes, gates, and the tools each step uses.
The top-level `mode` field only changes *who you hand it to*:

- **`mode: opt`** (default) — hand it to code agents. Drive them with the orchestrator:
  `node scripts/orchestrate-workflow.mjs --invoke --loop` auto-advances through every
  stage until a human gate, scoping each agent to that step's skills/MCP/hooks.
- **`mode: team`** — hand it to human teammates. Compiling emits **`PLAYBOOK.md`**, a
  copy-paste checklist each person runs on their own product or module. Track everyone
  side by side with **`tpan-opt-co-worker dashboard`** (one labelled run per module).

The definition is identical; only the distribution target differs.

A stage can hold **sub-nodes** (for example `ai-test` → `unit`, `integration`,
`user-acceptance`), and any stage or sub-node can bind its own `skills`, `mcpServers`,
and `hooks`. At `--invoke` those bindings reach the agent three ways: the work-order
brief JSON, the `TPAN_OPT_SKILLS` / `TPAN_OPT_MCP_SERVERS` / `TPAN_OPT_HOOKS` env vars,
and the `{skills}` / `{mcpServers}` / `{hooks}` agent-command placeholders.

## System Architecture

```text
+--------------------------+
| Workflow Designer        |
| roles, stages, gates     |
+------------+-------------+
             |
             v
+--------------------------+
| Workflow Compiler        |
| AGENTS.md, configs, CI   |
+------------+-------------+
             |
             v
+--------------------------+
| Execution Orchestrator   |
| state, routing, approval |
+------------+-------------+
             |
             v
+--------------------------+
| Harness Adapters         |
| Codex, Claude, CI, MCP   |
+------------+-------------+
             |
             v
+--------------------------+
| Verification Layer       |
| tests, review, evidence  |
+------------+-------------+
             |
             v
+--------------------------+
| Knowledge & Governance   |
| policies, audit, reuse   |
+--------------------------+
```

## Example Workflow

```yaml
name: production-feature-workflow
version: 1.0.0

gatePresets:
  team:review-signoff:
    type: manual
    description: Engineering owner reviewed the change and signed off.

roles:
  planner:
    skills:
      - product-capability
      - api-design
    permissions:
      - read_repo
      - write_docs

  engineer:
    skills:
      - tdd-workflow
      - coding-standards
    permissions:
      - read_repo
      - write_code
      - run_tests

  reviewer:
    skills:
      - code-review
      - security-review
    permissions:
      - read_diff
      - comment

stages:
  - id: clarify
    owner: planner
    output: capability_spec
    gates:
      - id: open_questions_resolved
        type: manual
        description: All blocking product questions have an owner or answer.

  - id: implement
    owner: engineer
    required:
      - tests_first
      - code_changes
    gates:
      - id: unit_tests_pass
        preset: node:test
      - id: coverage_above_80
        preset: node:coverage

  - id: review
    owner: reviewer
    gates:
      - id: no_critical_security_issues
        type: manual
      - id: no_high_code_quality_issues
        preset: team:review-signoff

  - id: ship
    owner: human
    gates:
      - id: human_approval
        type: manual
      - id: release_notes_generated
        type: manual
```

Stages can nest sub-nodes and bind tools per step, and the top-level `mode` chooses the hand-off target:

```yaml
mode: team            # or opt (default). Same definition either way.

stages:
  - id: ai-test
    owner: engineer
    skills: [test-strategy]          # stage-level tools
    nodes:
      - id: unit
        skills: [unit-testing]       # node-level tools, delivered at --invoke
        gates: [{ id: unit-pass, preset: node:test }]
      - id: user-acceptance
        gates: [{ id: uat-signoff, type: manual }]
```

## Key Objects

| Object | Purpose |
| --- | --- |
| `WorkflowTemplate` | A reusable team delivery process. |
| `WorkflowRun` | One execution of a workflow against a project or task. |
| `Stage` | A workflow phase with inputs, outputs, owner, gates, and optional sub-nodes. |
| `Node` | A sub-step inside a stage (e.g. `ai-test` → `unit`/`integration`), with its own output, gates, and bound skills/MCP/hooks. |
| `Role` | A human or agent responsibility boundary. |
| `AgentProfile` | A concrete agent configuration with skills, tools, permissions, and behavior rules. |
| `Skill` | A reusable instruction package for a specific capability. |
| `McpServer` | A tool/data connector available to selected roles. |
| `Hook` | Automation triggered before, during, or after workflow execution. |
| `Gate` | A required condition before the workflow can move forward. |
| `Playbook` | `PLAYBOOK.md`, the human-readable checklist a teammate runs end to end in `team` mode. |
| `Artifact` | A durable output such as a plan, spec, patch, test report, review, or release note. |
| `VerificationResult` | Evidence that a gate passed or failed. |
| `Approval` | A human decision for sensitive or irreversible actions. |

## Workflow nodes: MCP servers and hooks

Skills are configured per role. MCP servers and lifecycle hooks are first-class workflow nodes: declare them once at the top level, then reference servers per role. The `wizard` command collects all of this interactively, but you can also author it by hand in `opt.workflow.json`:

```json
{
  "name": "my-workflow",
  "mcpServers": {
    "co-worker": { "command": "node", "args": ["src/cli.js", "mcp"] },
    "docs": { "url": "https://mcp.example.com/sse", "transport": "sse" }
  },
  "roles": {
    "lead": { "mcpServers": ["co-worker"] }
  },
  "hooks": [
    { "id": "preflight", "event": "pre-tool", "command": "node scripts/preflight.mjs", "matcher": "Bash" }
  ]
}
```

- **`mcpServers`** is a map of server id to either a local process (`command`, optional `args`, optional `env`) or a remote endpoint (`url`, optional `transport` — `stdio`/`sse`/`http`). A server is local **xor** remote. Each role may list assigned server ids in `roles.<id>.mcpServers`, which must reference declared servers.
- **`hooks`** is an array of `{ id, event, command }`, where `event` is one of `pre-tool`, `post-tool`, `stop`, `user-prompt-submit`, `session-start`. Tool events (`pre-tool`/`post-tool`) accept an optional `matcher` to scope by tool name. Each `id` must be a unique identifier.

When a workflow declares either node, compiling emits the additional harness-native assets:

- `.mcp.json` (Claude Code / generic MCP) and `[mcp_servers.*]` tables in `.codex/config.toml`, plus per-role MCP listings in `AGENTS.md` and the agent files.
- `.claude/settings.json` (Claude Code native hooks, grouped by `PreToolUse`/`PostToolUse`/`Stop`/`UserPromptSubmit`/`SessionStart`) and a harness-neutral `.tpan-opt-co-worker/hooks.json` manifest, plus a `## Hooks` section in `AGENTS.md`.

Workflows that declare neither node compile byte-identically to before, so these files only appear when you opt in.

## OPT: One Person Team

OPT mode lets one human lead operate a structured virtual team:

- The human owns goals, product judgment, priority, and approval.
- Agents own specialized execution and review work.
- The system owns workflow state, permission boundaries, evidence, and quality gates.

An OPT team may include:

- Product planner
- System architect
- Frontend engineer
- Backend engineer
- QA engineer
- Security reviewer
- Code reviewer
- Documentation writer
- Release manager

## Repository Distribution

A workflow can be compiled into repository-local assets such as:

- `AGENTS.md`
- `CLAUDE.md`
- `PLAYBOOK.md` (human teammate checklist; the team-mode hand-off artifact)
- `.codex/config.toml`
- `.codex/agents/*.toml`
- `.cursor/rules/*.mdc`
- `.opencode/agents/*.md`
- `.claude/agents/*.md`
- `.agents/skills/*`
- GitHub Actions workflows
- PR templates
- issue templates
- verification scripts
- `.tpan-opt-co-worker/workflow.manifest.json`
- project-specific policy files

The goal is to keep team standards close to the codebase while allowing organization-level reuse.

## Engineering Quality

Commercial use starts with repeatable local checks. This repository ships no-dependency quality scripts:

```bash
npm run verify
npm run lint
npm run typecheck
npm run repo:health
npm run test:coverage
npm run build
npm run pack:check
npm audit --audit-level=high
```

- `verify` runs the complete local quality gate used before release.
- `lint` and `typecheck` syntax-check all JavaScript and MJS files with the active Node runtime; `typecheck` is kept as a compatibility gate name for generated npm workflows in this plain JavaScript package.
- `repo:health` checks unresolved conflict markers, focused/skipped tests, naming drift, and source file size.
- `test:coverage` runs the full Node test suite and enforces 80%+ line, branch, and function coverage for product code under `src/**` and `scripts/**`.
- `build` compiles the example workflow into a temporary repository and verifies generated assets can be written.
- `pack:check` runs an npm package dry run with an isolated cache and verifies required release files.
- `npm audit --audit-level=high` verifies dependency security posture; the package currently has no runtime dependencies.
GitHub Actions runs the same quality gates on `main` pushes and pull requests for Node.js 22.

## Current CLI

```text
tpan-opt-co-worker quickstart --out . [--template opt-demo] [--team product-delivery] [--name my-workflow] [--no-demo] [--no-open] [--force]
tpan-opt-co-worker wizard --out . [--force]
tpan-opt-co-worker init --out . [--template production-feature] [--team product-delivery] [--policy quality-standard] [--name production-feature-workflow] [--force]
tpan-opt-co-worker validate --workflow opt.workflow.json [--preset-file gate-presets.json] [--json]
tpan-opt-co-worker schema [--out workflow.schema.json] [--force]
tpan-opt-co-worker catalog [--json] [--out catalog.json] [--force]
tpan-opt-co-worker presets [--json]
tpan-opt-co-worker templates [--json]
tpan-opt-co-worker policies [--json]
tpan-opt-co-worker teams [--json]
tpan-opt-co-worker marketplace [--json] [--out marketplace.json] [--force]
tpan-opt-co-worker compile --workflow opt.workflow.json --out . [--preset-file gate-presets.json] [--force] [--dry-run]
tpan-opt-co-worker status [--out .] [--run-id <id>]
tpan-opt-co-worker next [--out .] [--run-id <id>]
tpan-opt-co-worker dashboard [--out .]
tpan-opt-co-worker approve <gate> --by <approver> [--stage <stage>] [--note <text>] [--out .] [--run-id local]
tpan-opt-co-worker mcp
```

`status`, `next`, `dashboard`, and `approve` drive a compiled repository from the command line. `status` prints the workflow and each stage's orchestration status (and, in `team` mode, points to `PLAYBOOK.md`); `next` prints the open work order(s) and the next action; both default to the latest run and accept `--run-id <id>` to inspect a specific orchestration run (for example the `real` run from a real-agent invocation); `dashboard` aggregates the latest verification run per product/module into one side-by-side table — the team-mode view where each teammate runs the whole pipeline on a different module (label a run with `node scripts/run-workflow.mjs --module <name>`); `approve <gate> --by <approver>` records approver evidence for a manual gate and advances the orchestrator — so you never hand-edit `manual-evidence.json`. Pass `--stage` when a gate id is reused across stages. These share their core with the MCP `co_worker_next` / `co_worker_approve` tools, so the CLI and in-agent flows behave identically. `mcp` runs the MCP server (see [Install as a plugin (MCP)](#install-as-a-plugin-mcp)).

`quickstart` is the one-command onboarding path: it runs the same scaffolding as `init`, compiles every harness asset, bundles an offline demo agent, and (unless `--no-demo`) drives a four-role agent team end to end with `--invoke` so the generated console shows a real, populated run that stops at one human-approval gate. It defaults to the `opt-demo` template (a runnable agent team) and opens the console for you unless you pass `--no-open`. Finish the seeded run with `approve human_approval --stage ship --by you`. The CLI `compile` step remains the authoritative path for applying edited workflows.

`wizard` is the interactive authoring path: it prompts for the template, optional reusable team, policy packs, MCP servers, per-role MCP assignments, lifecycle hooks, and an optional orchestrator agent command (committed as `orchestration.agentCommand` so `orchestrate --invoke` drives each stage's owner agent with no flags), then writes `opt.workflow.json` and compiles every harness asset (including `.mcp.json`, `.codex/config.toml` MCP wiring, and `.claude/settings.json` hooks) into `--out`. Press Enter to accept each `[default]`; answer prompts by number or id. See [Workflow nodes: MCP servers and hooks](#workflow-nodes-mcp-servers-and-hooks) for the schema it produces. It refuses to overwrite existing files unless `--force` is provided.

`init` writes a starter `opt.workflow.json` from a named workflow template. The default `production-feature` template includes planner, engineer, reviewer, and release-manager roles plus a production delivery flow. Passing `--team <id>` uses the reusable team's recommended template unless `--template` is also set, and records `organization.team` plus recommended policy ids in the generated workflow. Passing `--policy <id>` appends validated organization policy packs; repeated policies are deduplicated while preserving order. When a selected policy contributes an automatable rule (currently `dependency_audit` from `security-baseline`), `init` injects a dedicated `policy_compliance` stage with the matching command gate (for example `npm:audit-high`) ahead of the final stage, so the rule is enforced during verification rather than only documented. Non-automatable rules stay advisory prompt text in the generated instructions. It refuses to overwrite an existing workflow unless `--force` is provided.

The default `production-feature` template uses the built-in `node:test` and `node:coverage` presets, so generated local runs expect the target repository to provide `npm test` and `npm run test:coverage`. When the template defines npm-based command gates and the target has no `package.json`, `init` scaffolds a placeholder `package.json` whose `test` and `test:coverage` scripts exit non-zero with a "configure me" message. This keeps the command gates anchored to the target repository instead of an unrelated parent `package.json`, and makes them fail honestly until you wire in real checks. An existing `package.json` is never modified. For non-Node projects or empty starter directories, start with `--template minimal`, or override command gates with workflow-defined `gatePresets` or `--preset-file`.

`validate` checks workflow shape, stage owners, gate presets, duplicate ids, and external preset registries without writing generated assets. Add `--json` to emit a machine-readable summary with workflow identity, role/stage/gate counts, gate type counts, roles, and stage gate ids.

`schema` prints the workflow JSON Schema to stdout by default, or writes it to `--out` with the same overwrite protection used by generated assets.

`catalog` lists the combined built-in catalog as text or JSON, including gate presets, workflow templates, organization policy packs, and reusable agent teams. Use `--out` to write a stable JSON artifact for Web Console, marketplace, or organization registry tooling; existing files require `--force`.

`presets` lists the built-in gate preset catalog as text or JSON, which is useful when designing organization-level workflow templates and policy registries.

`templates` lists the built-in workflow template catalog as text or JSON, which is the first local building block for organization-level reusable delivery flows.

`policies` lists built-in organization policy packs as text or JSON, including quality, human-control, and security baselines that can later be attached to reusable templates and workflows.

`teams` lists reusable agent team catalogs as text or JSON, including recommended role sets plus template and policy associations for future organization-level workflow generation.

`marketplace` lists built-in distribution package metadata for reusable skills, MCP server profiles, and portable hook packages. This is a metadata preview only: package installation is not yet implemented, and the referenced `install.files` are descriptive targets rather than shipped assets. Use `--out` to write a marketplace JSON artifact that can seed future registries, web-console package pickers, or organization-approved package mirrors.

Generated files:

- `AGENTS.md`
- `CLAUDE.md`
- `PLAYBOOK.md` (human teammate checklist; the team-mode hand-off artifact)
- `.codex/config.toml`
- `.codex/agents/<role>.toml`
- `.claude/agents/<role>.md`
- `.cursor/rules/tpan-opt-co-worker.mdc`
- `.opencode/agents/<role>.md`
- `.github/pull_request_template.md`
- `.github/workflows/tpan-opt-co-worker-verify.yml`
- `.gitlab-ci.yml`
- `.tpan-opt-co-worker/catalog.json`
- `.tpan-opt-co-worker/console/index.html`
- `.tpan-opt-co-worker/console/catalog.js`
- `.tpan-opt-co-worker/console/orchestration.js`
- `.tpan-opt-co-worker/console/orchestration.json`
- `.tpan-opt-co-worker/marketplace.json`
- `.tpan-opt-co-worker/workflow.manifest.json`
- `.tpan-opt-co-worker/workflow.schema.json`
- `opencode.json`
- `scripts/list-runs.mjs`
- `scripts/orchestrate-workflow.mjs`
- `scripts/run-workflow.mjs`
- `scripts/verify-workflow.mjs`

The compiler validates workflow shape, rejects unknown stage owners, rejects duplicate stage ids, blocks path traversal, and refuses to overwrite existing files unless `--force` is provided.

Generated harness instruction files include an `Organization Standards` section when the workflow defines `organization.team` or `organization.policies`, so Codex, Claude Code, Cursor, and OpenCode receive the same team and policy context. Built-in policy packs are expanded into their descriptions and rule ids inside the generated instructions; custom organization policy ids are preserved as policy references.

The generated Claude Code assets include a root `CLAUDE.md` workflow context and one `.claude/agents/<role>.md` file per workflow role, so Claude Code can follow the same role boundaries, stages, gates, and evidence requirements as Codex.

The generated Cursor rule at `.cursor/rules/tpan-opt-co-worker.mdc` keeps workflow boundaries, gates, and verification behavior in Cursor's project rules context.

The generated OpenCode assets include `opencode.json` plus one `.opencode/agents/<role>.md` subagent file per workflow role.

The generated `.tpan-opt-co-worker/workflow.manifest.json` is the harness-neutral manifest for local runners, the execution orchestrator, and future adapters. It records organization metadata, normalized roles, stages, catalog and marketplace artifact paths, harness asset paths (including the orchestrator script and its state directory under `harnesses.orchestrator`), and the standard verification command.

The generated `.tpan-opt-co-worker/workflow.schema.json` is a JSON Schema for workflow authoring tools, editors, and future web-console form generation.

The generated `.tpan-opt-co-worker/catalog.json`, `.tpan-opt-co-worker/marketplace.json`, and `.tpan-opt-co-worker/console/catalog.js` expose organization-level workflow templates, policy packs, reusable teams, and marketplace packages for skills, MCP servers, and hooks.

The generated `.tpan-opt-co-worker/console/index.html` is a static workflow console that can be opened directly in a browser. It shows workflow identity, organization team/policy metadata, role ownership, stage sequence, manual/command gate distribution, an editable Workflow Designer panel that validates a workflow draft in the browser against the same structural rules the compiler enforces (names, roles, owners, stage dependencies, gates) and offers copy/download of the edited JSON — with the CLI `compile` remaining the authoritative validator that writes assets — alongside the schema path, organization catalog panels for reusable templates/policies/teams, marketplace package discovery, run summary status counts, filterable run history with direct links to each run's `evidence.json` and `summary.md`, and matching per-run gate details from `.tpan-opt-co-worker/console/runs.js` with `.tpan-opt-co-worker/console/runs.json` as a data fallback. Gate details include command text, exit codes, approver, notes, and safe evidence links where available.

The generated local runner reads the manifest, invokes verification, writes a standard run directory, updates `.tpan-opt-co-worker/runs/index.json`, and mirrors the run index plus gate details to `.tpan-opt-co-worker/console/runs.json` and `.tpan-opt-co-worker/console/runs.js` for the static console:

```bash
node scripts/run-workflow.mjs \
  --run-id feature-001 \
  --module payments \
  --manual-evidence examples/manual-evidence.json
```

`--module <name>` labels the run with the product or module it covers, so `tpan-opt-co-worker dashboard` (and the console) can group runs per module — the team-mode pattern where each teammate runs the same pipeline on their own slice. The runner also maintains `.tpan-opt-co-worker/runs/index.json`. List local run history with:

```bash
node scripts/list-runs.mjs
node scripts/list-runs.mjs --json
```

The generated execution orchestrator is a dependency-gated state machine. Unlike the verifier, which evaluates every command gate globally, the orchestrator only starts a stage once all of its dependencies are done, and it emits a work order for every stage whose dependencies are satisfied: the role's skills and permissions, the per-harness agent file to drive (`.claude/agents/<role>.md`, `.codex/agents/<role>.toml`, `.opencode/agents/<role>.md`), the stage's required work, the pending gates, and the next action. State is written to `.tpan-opt-co-worker/orchestrations/<run-id>/state.json` and a human-readable `state.md`. The script exits non-zero while the workflow is blocked and exits zero only when every stage is complete, so it can gate CI:

```bash
node scripts/orchestrate-workflow.mjs \
  --run-id feature-001 \
  --manual-evidence examples/manual-evidence.json
```

Add `--invoke` to drive each ready stage's owner agent (with `--agent-command "<cmd>"`, or a persisted `orchestration.agentCommand`), and `--loop` to repeat the scheduling pass until the run completes, stalls at a pending manual gate, or hits `--max-iterations` (default 25). This is the OPT autopilot: agents advance the flow and only stop for a human gate. Each invocation is scoped to its stage+sub-node tooling via the brief JSON, the `TPAN_OPT_SKILLS` / `TPAN_OPT_MCP_SERVERS` / `TPAN_OPT_HOOKS` env vars, and `{skills}` / `{mcpServers}` / `{hooks}` command placeholders. Agents can never self-approve a manual gate.

Stages declare dependencies with an optional `dependsOn` array of earlier stage ids; the array stays a valid topological order because a stage may only depend on stages declared before it (cycles are impossible). When `dependsOn` is omitted a stage defaults to depending on the immediately preceding stage, so a plain list of stages stays strictly sequential — the routing and approval boundary then sits at the first unsatisfied stage, exactly as before. Declaring dependencies turns the list into a DAG: stages that fan out from a shared prerequisite are scheduled in parallel, so several owners can hold open work orders at once (`state.currentStages` / `state.workOrders` carry the full set, with `currentStage` / `workOrder` kept as the first frontier for compatibility). A stage with any unfinished dependency stays `pending` and its command gates never run. Use an explicit empty `dependsOn: []` to opt a stage out of the sequential default and start it as an independent branch.

```json
{
  "stages": [
    { "id": "plan", "owner": "planner", "gates": ["scope_confirmed"] },
    { "id": "backend", "owner": "backend-eng", "dependsOn": ["plan"], "gates": ["api_tests"] },
    { "id": "frontend", "owner": "frontend-eng", "dependsOn": ["plan"], "gates": ["ui_tests"] },
    { "id": "integrate", "owner": "release", "dependsOn": ["backend", "frontend"], "gates": ["human_approval"] }
  ]
}
```

Command gates still run sequentially within a single process (the orchestrator does not yet execute gates concurrently); parallelism here means independent branches are routed and surfaced together rather than artificially serialized behind the first incomplete stage.

The orchestrator can also drive the current stage's owner agent. Pass `--invoke` with a harness-neutral `--agent-command` template and the orchestrator, when it reaches an unsatisfied stage, writes a work-order brief to `brief-<stage>.json`, runs the command once for that stage's owner, then re-evaluates the stage's gates and advances if they now pass. The command template substitutes `{stage}`, `{role}`, and `{brief}`, and the same values are exported as `TPAN_OPT_STAGE`, `TPAN_OPT_ROLE`, and `TPAN_OPT_BRIEF` environment variables, so any agent CLI (Claude Code, Codex, OpenCode, or a custom runner) can be wired in without locking the workflow to one harness:

```bash
node scripts/orchestrate-workflow.mjs \
  --run-id feature-001 \
  --manual-evidence examples/manual-evidence.json \
  --invoke \
  --agent-command 'claude -p "Complete stage {role} using brief {brief}"'
```

Agent invocation is opt-in because it can change the repository and incur cost, is bounded to one invocation per stage per run, and never satisfies manual gates: agents cannot self-approve, so human approval gates still block until evidence is attached. Each invocation is recorded in `invocation-<stage>.json` and the run `state.json`.

The agent command can also be persisted into the workflow so operators do not retype it on every run. Add an `orchestration` block with a default `agentCommand` template and optional per-role `agents` overrides; the compiler validates it and writes it into the manifest under `harnesses.orchestrator`. The orchestrator then resolves the command for each stage owner with the precedence CLI `--agent-command` → per-role `agents[owner]` → default `agentCommand`, so `--invoke` works with no flags when a command is committed, while a CLI flag still overrides for one-off runs:

```json
{
  "orchestration": {
    "agentCommand": "claude -p \"Complete stage {role} using brief {brief}\"",
    "agents": {
      "engineer": "codex exec --brief {brief}"
    }
  }
}
```

The orchestrator also mirrors its latest state into the static console at `.tpan-opt-co-worker/console/orchestration.json` and `.tpan-opt-co-worker/console/orchestration.js`. The console's Orchestration panel renders the run status, current stage, per-stage progress, the open work order (owner, pending gates, next action), and recent agent invocations, with `orchestration.js` as the default data source and `orchestration.json` as a fetch fallback.

The generated GitHub Actions workflow runs `scripts/verify-workflow.mjs --run-dir .tpan-opt-co-worker/runs/ci` on pull requests and `main` pushes, then uploads `.tpan-opt-co-worker/runs` as a CI artifact for audit and review.

The generated GitLab CI job runs the same verifier with `--run-dir .tpan-opt-co-worker/runs/gitlab` and preserves `.tpan-opt-co-worker/runs` as a pipeline artifact.

Evidence report shape:

```json
{
  "workflow": {
    "name": "production-feature-workflow",
    "version": "1.0.0"
  },
  "passed": true,
  "commandPassed": true,
  "allGatesPassed": false,
  "startedAt": "2026-06-24T00:00:00.000Z",
  "finishedAt": "2026-06-24T00:00:01.000Z",
  "commandGates": [
    {
      "stageId": "implement",
      "id": "unit_tests_pass",
      "preset": "node:test",
      "command": "npm test",
      "status": "passed",
      "exitCode": 0
    }
  ],
  "manualGates": [
    {
      "stageId": "ship",
      "id": "human_approval",
      "status": "pending"
    }
  ]
}
```

Manual evidence file shape:

```json
{
  "gates": {
    "human_approval": {
      "approvedBy": "team-lead@example.com",
      "note": "Release approved by the human lead.",
      "links": ["https://example.com/release-review"]
    }
  }
}
```

Workflow verification runs stages in order. If a command gate fails or a manual gate is still pending in an earlier stage, command gates in later stages are recorded as `skipped` and are not executed.

When all command gates pass and every manual gate has evidence, `allGatesPassed` becomes `true`.

Manual evidence can be keyed by gate id when that manual gate id is unique across the workflow. If multiple stages use the same manual gate id, key evidence as `<stageId>.<gateId>` so approvals do not accidentally apply to more than one stage.

External preset registry files use the same `gatePresets` shape:

```json
{
  "gatePresets": {
    "org:security-review": {
      "type": "manual",
      "description": "Security reviewer confirmed there are no unresolved critical or high findings."
    },
    "org:docs-check": {
      "type": "command",
      "description": "Run organization-standard documentation checks.",
      "command": "npm run docs:check"
    }
  }
}
```

`--preset-file` can be repeated. Duplicate custom preset names across files or between a file and the workflow are rejected.

Gate types:

- `manual`: records a required approval, review, or evidence item.
- `command`: runs a shell command from `scripts/verify-workflow.mjs` and fails the verification script if the command exits non-zero.

Built-in gate presets:

| Preset | Type | Command |
| --- | --- | --- |
| `node:test` | `command` | `npm test` |
| `node:coverage` | `command` | `npm run test:coverage` |
| `npm:lint` | `command` | `npm run lint` |
| `npm:typecheck` | `command` | `npm run typecheck` |
| `npm:audit-high` | `command` | `npm audit --audit-level=high` |

Preset commands can be overridden by setting `command` explicitly on the gate.

Workflow-defined presets:

```json
{
  "gatePresets": {
    "team:docs-check": {
      "type": "command",
      "description": "Verify project documentation.",
      "command": "npm run docs:check"
    },
    "team:review-signoff": {
      "type": "manual",
      "description": "Engineering owner reviewed and signed off."
    }
  }
}
```

Custom preset names cannot override built-in preset names.

## Roadmap

- [x] Define the first workflow schema.
- [x] Build a local workflow compiler.
- [x] Generate `AGENTS.md`, harness configs, and PR templates.
- [x] Add executable command gates and manual evidence gates.
- [x] Add built-in gate presets for tests, lint, typecheck, and audit.
- [x] Add CLI built-in gate preset discovery.
- [x] Add workflow-defined custom gate presets.
- [x] Add external organization-level preset registry files.
- [x] Add generated workflow run evidence reports.
- [x] Add manual gate evidence input.
- [x] Add workflow run artifact directory management.
- [x] Add Codex harness adapter generation.
- [x] Add Claude Code harness adapter generation.
- [x] Add Cursor harness adapter generation.
- [x] Add OpenCode harness adapter generation.
- [x] Add harness-neutral workflow manifest generation.
- [x] Add organization metadata to manifest and web console outputs.
- [x] Add organization standards to generated harness instructions.
- [x] Expand built-in organization policy pack rules into generated harness instructions.
- [x] Add local runner harness adapter generation.
- [x] Add a stage-gated execution orchestrator that routes work and emits per-stage work orders.
- [x] Add opt-in, harness-neutral agent invocation that drives the current stage's owner agent and re-gates.
- [x] Persist the orchestrator agent command (default and per-role) into the workflow and manifest.
- [x] Schedule independent stages in parallel via a stage dependency graph with multi-owner work orders.
- [x] Surface orchestration state, work orders, and agent invocations in the static web console.
- [x] Add GitHub Actions template generation.
- [x] Add GitLab CI template generation.
- [x] Add starter workflow template generation.
- [x] Add CLI workflow template catalog discovery.
- [x] Add CLI organization policy pack discovery.
- [x] Add CLI reusable agent team catalog discovery.
- [x] Add team-backed workflow initialization.
- [x] Add policy-backed workflow initialization.
- [x] Add CLI combined catalog discovery.
- [x] Add CLI combined catalog artifact export.
- [x] Add CLI workflow validation without asset generation.
- [x] Add CLI workflow JSON Schema export.
- [x] Add generated static web console for workflow overview.
- [x] Add generated web console run history sync.
- [x] Add generated web console workflow definition panel.
- [x] Add generated web console run summary tracking.
- [x] Add generated web console run status filters.
- [x] Add generated web console status-filtered gate details.
- [x] Add generated web console gate evidence metadata.
- [x] Add generated web console run artifact links.
- [x] Make the web console Workflow Designer editable with in-browser draft validation and JSON export.
- [x] Add a one-command quickstart that scaffolds, compiles, and seeds a demo run for an immediately populated console.
- [x] Ship a zero-dependency MCP server (quickstart, compile, validate, catalog, next, approve) so co-worker installs as a plugin in Codex, Claude Code, and MCP-capable agents.
- [x] Add first-class `status`, `next`, and `approve` CLI subcommands that drive and approve workflows without hand-editing evidence files.
- [x] Add marketplace catalog discovery for skills, MCP servers, and hooks.
- [x] Add a web console for workflow design and run tracking.
- [x] Add organization-level templates, policies, and reusable agent teams.
- [x] Add marketplace-style distribution for skills, MCP servers, and hooks.

## Design Principles

- **Workflow-first**: process should be explicit, reusable, and versioned.
- **Verification-first**: no artifact is trusted without evidence.
- **Human-controlled**: humans approve sensitive, external, costly, or irreversible actions.
- **Harness-neutral**: workflows should not be locked to one AI coding tool.
- **Repository-native**: project rules should be exportable into the repo.
- **Composable**: roles, skills, hooks, MCP servers, and gates should be reusable building blocks.
- **Auditable**: every important decision and quality result should be traceable.

## Inspired By

TPAN-OPT/CO-WORKER is inspired by proven patterns from:

- AI coding harnesses and agent frameworks
- workflow engines and CI/CD systems
- open-source repository governance
- platform engineering and internal developer portals
- ECC-style agent, skill, command, hook, and MCP organization

## Project Status

This project is in active early implementation. The current CLI can create starter workflows, compile repository-local harness assets, run verification gates, and persist workflow evidence.

## Contributing

Contributions are welcome once the initial schema and runtime boundaries are published.

Useful contribution areas will include:

- workflow schema design
- harness adapter design
- agent role templates
- verification gates
- security policy templates
- documentation and examples
- UI/UX for workflow design and run tracking

## License

This project is licensed under the [MIT License](LICENSE).
