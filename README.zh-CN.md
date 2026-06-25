# TPAN-OPT/CO-WORKER

> **语言:** [English](README.md) | 简体中文

TPAN-OPT/CO-WORKER 是一个面向 AI 时代的软件团队操作系统，用于设计、下发和验证标准化工作流，让人类成员、code agent、Git 仓库和自动化 harness 按统一流程协作交付。

它面向希望使用 AI 提升交付效率、同时又不牺牲流程纪律、工程标准、安全审查和质量证据的团队。它也支持 **OPT**，即 **One Person Team**：由一个负责人管控多个专业 AI agent，完成过去通常需要多人团队完成的工作。

## 为什么需要这个项目

AI 编码工具让个人效率变高，但团队协作仍然经常出现这些问题：

- 协作分散在聊天、agent、仓库和各种工具里，过程不可控。
- 产出质量依赖 prompt、模型、个人经验和本地环境，稳定性不足。
- 团队标准停留在文档里，无法在执行过程中自动约束。
- Agent 的工作过程难以审计、复现和验证。
- 公司人员缩减后，小团队甚至一个人需要承担过去更大团队的工作量。

TPAN-OPT/CO-WORKER 的目标是把团队的工作方式变成可版本化、可执行、可分发、可验证的工作流。

## 当前实现范围

当前 package 是一个无外部依赖的 Node.js workflow compiler、本地 verifier、本地 runner 和静态 workflow console。它会校验 JSON workflow 定义，生成仓库内 harness 资产，按阶段执行验证门禁，记录证据，并把本地 run history 同步到生成的 console。

本文档中更完整的 team operating system 表述代表产品方向。生成的本地 runner 之外的运行时调度、marketplace package 安装闭环、YAML authoring 和托管式编排目前还不属于当前 package 的实现范围。

## TPAN-OPT/CO-WORKER 提供什么

- **工作流设计器**：定义标准交付流程，包括阶段、角色、门禁、产物和审批。
- **Agent 团队构建器**：配置 planner、architect、engineer、reviewer、security reviewer、QA、release manager、documentation owner 等专业角色。
- **Skill / MCP / Hook 注册中心**：接入标准或自定义 skills、MCP servers、hooks、检查脚本、模板和自动化策略。
- **Harness 适配层**：把同一套工作流下发到 Codex、Claude Code、Cursor、OpenCode、GitHub Actions、本地 runner 或自研 agent harness。
- **质量验证门禁**：在流程推进前强制执行测试、lint、typecheck、覆盖率、E2E、安全审查、文档审查和人工审批。
- **证据链**：保存每次 workflow run 的产物、决策、测试结果、review 发现、截图、日志和审批记录。
- **OPT Runtime**：让一个负责人管控多个专业 agent，并通过明确的权限边界和审批点完成高质量交付。

## 快速开始

TPAN-OPT/CO-WORKER 当前提供一个无外部依赖的 Node.js workflow compiler。

环境要求：

- Node.js 20 或更高版本
- npm 10 或更高版本

运行测试：

```bash
npm test
```

在目标仓库中创建 starter workflow：

```bash
node src/cli.js init --out /path/to/target-repo --name production-feature-workflow
```

初始化 workflow 前查看内置聚合 catalog：

```bash
node src/cli.js catalog
node src/cli.js catalog --json
node src/cli.js catalog --out catalog.json
```

查看内置 workflow templates：

```bash
node src/cli.js templates
node src/cli.js templates --json
```

查看内置组织级 policy packs：

```bash
node src/cli.js policies
node src/cli.js policies --json
```

查看可复用 agent teams：

```bash
node src/cli.js teams
node src/cli.js teams --json
```

从可复用 team 推荐创建 starter workflow：

```bash
node src/cli.js init \
  --out /path/to/target-repo \
  --team product-delivery \
  --policy security-baseline \
  --name production-feature-workflow
```

使用显式组织级 policies 创建 starter workflow：

```bash
node src/cli.js init \
  --out /path/to/target-repo \
  --policy quality-standard \
  --policy security-baseline \
  --name production-feature-workflow
```

从指定模板创建 starter workflow：

```bash
node src/cli.js init \
  --out /path/to/target-repo \
  --template production-feature \
  --name production-feature-workflow
```

创建不假设 npm scripts 的语言无关 starter workflow：

```bash
node src/cli.js init \
  --out /path/to/target-repo \
  --template minimal \
  --name minimal-evidence-workflow
```

生成仓库资产前先校验 workflow：

```bash
node src/cli.js validate --workflow /path/to/target-repo/opt.workflow.json
```

输出机器可读的 validation summary：

```bash
node src/cli.js validate --workflow /path/to/target-repo/opt.workflow.json --json
```

输出或写出 workflow JSON Schema：

```bash
node src/cli.js schema --out /path/to/target-repo/workflow.schema.json
```

设计组织级 workflow 前查看内置 gate presets：

```bash
node src/cli.js presets
node src/cli.js presets --json
```

预览将生成的仓库资产：

```bash
node src/cli.js compile \
  --workflow /path/to/target-repo/opt.workflow.json \
  --out /tmp/tpan-opt-co-worker-demo \
  --dry-run
```

生成资产到目标仓库：

```bash
node src/cli.js compile \
  --workflow /path/to/target-repo/opt.workflow.json \
  --out /path/to/target-repo
```

通过外部 preset registry 生成资产：

```bash
node src/cli.js compile \
  --workflow examples/opt.workflow.json \
  --preset-file examples/gate-presets.json \
  --out /path/to/target-repo
```

覆盖之前生成的文件：

```bash
node src/cli.js compile --workflow examples/opt.workflow.json --out /path/to/target-repo --force
```

当前编译器读取 JSON workflow 文件。YAML 支持在后续计划中。

打开生成的静态 workflow console。它会立即展示 workflow overview 和 Workflow Designer JSON 面板，并在本地 workflow run 生成 `.tpan-opt-co-worker/console/runs.json` 和 `.tpan-opt-co-worker/console/runs.js` 后展示 run summary、带 evidence artifact 链接且可按状态筛选的 run history，以及带 command exit code 和人工证据元数据的同步筛选 gate details。

```bash
open /path/to/target-repo/.tpan-opt-co-worker/console/index.html
```

在已编译的目标仓库里运行生成的验证检查：

```bash
node scripts/verify-workflow.mjs
```

写出结构化 workflow evidence report：

```bash
node scripts/verify-workflow.mjs --report .tpan-opt-co-worker/evidence.json
```

附加人工审批或 review 证据：

```bash
node scripts/verify-workflow.mjs \
  --manual-evidence examples/manual-evidence.json \
  --report .tpan-opt-co-worker/evidence.json
```

创建完整 workflow run artifact 目录：

```bash
node scripts/verify-workflow.mjs \
  --manual-evidence examples/manual-evidence.json \
  --run-dir .tpan-opt-co-worker/runs/feature-001
```

Run 目录包含：

- `evidence.json`：机器可读的 gate 结果。
- `summary.md`：人类可读的 workflow evidence summary。

## 核心理念

大多数 AI 工具关注“让一个 agent 完成一个任务”。

TPAN-OPT/CO-WORKER 关注“让一个团队反复产出经过验证的高质量成果”。

```text
团队标准
  -> 工作流模板
  -> Agent 角色 + Skills + MCP + Hooks
  -> 仓库 / Harness 下发
  -> Workflow Run
  -> 已验证产物
  -> Review、审批、发布
```

## 系统架构

```text
+--------------------------+
| Workflow Designer        |
| 角色、阶段、门禁          |
+------------+-------------+
             |
             v
+--------------------------+
| Workflow Compiler        |
| AGENTS.md、配置、CI       |
+------------+-------------+
             |
             v
+--------------------------+
| Execution Orchestrator   |
| 状态、路由、审批          |
+------------+-------------+
             |
             v
+--------------------------+
| Harness Adapters         |
| Codex、Claude、CI、MCP    |
+------------+-------------+
             |
             v
+--------------------------+
| Verification Layer       |
| 测试、审查、证据          |
+------------+-------------+
             |
             v
+--------------------------+
| Knowledge & Governance   |
| 策略、审计、复用          |
+--------------------------+
```

## 工作流示例

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

## 核心对象

| 对象 | 作用 |
| --- | --- |
| `WorkflowTemplate` | 可复用的团队交付流程。 |
| `WorkflowRun` | 某个任务或项目上的一次流程执行。 |
| `Stage` | 工作流阶段，包含输入、输出、负责人和门禁。 |
| `Role` | 人类或 agent 的职责边界。 |
| `AgentProfile` | 具体 agent 配置，包括 skills、工具、权限和行为规则。 |
| `Skill` | 针对某个能力的可复用指令包。 |
| `McpServer` | 面向特定角色开放的工具或数据连接器。 |
| `Hook` | 在工作流执行前、中、后触发的自动化逻辑。 |
| `Gate` | 流程推进前必须满足的条件。 |
| `Artifact` | 可持久化产物，例如计划、规格说明、代码补丁、测试报告、review 或发布说明。 |
| `VerificationResult` | 某个门禁通过或失败的证据。 |
| `Approval` | 人类对敏感或不可逆动作的确认。 |

## OPT：One Person Team

OPT 模式让一个人可以管理一个结构化的虚拟团队：

- 人类负责人负责目标、产品判断、优先级和审批。
- 专业 agent 负责规划、实现、检查、验证和文档等具体工作。
- 系统负责工作流状态、权限边界、证据记录和质量门禁。

一个 OPT 团队可以包括：

- 产品规划 agent
- 系统架构 agent
- 前端工程 agent
- 后端工程 agent
- QA agent
- 安全审查 agent
- 代码审查 agent
- 文档 agent
- 发布管理 agent

## 仓库下发

工作流可以被编译成仓库内的标准资产，例如：

- `AGENTS.md`
- `CLAUDE.md`
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

目标是让团队标准贴近代码仓库，同时支持组织级复用。

## 工程质量

商业应用首先需要可重复的本地检查。本仓库提供零运行时依赖的质量脚本：

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

- `verify` 会运行发布前完整本地质量门禁。
- `lint` 和 `typecheck` 会用当前 Node runtime 对所有 JavaScript 和 MJS 文件做语法检查；在这个纯 JavaScript package 中，`typecheck` 作为生成 npm workflows 的兼容性门禁名称保留。
- `repo:health` 会检查未解决冲突标记、focused/skipped tests、命名漂移和源码文件规模。
- `test:coverage` 会运行完整 Node 测试套件，并强制要求 `src/**` 和 `scripts/**` 产品代码的 line、branch、function 覆盖率均不低于 80%。
- `build` 会把示例 workflow 编译到临时仓库，验证生成资产可以正常写出。
- `pack:check` 会用隔离 npm cache 执行 package dry run，并验证必要发布文件存在。
- `npm audit --audit-level=high` 会验证依赖安全状态；当前 package 没有运行时依赖。
GitHub Actions 会在 `main` push 和 pull request 中用 Node.js 20 与 22 运行同一套质量门禁。

## 当前 CLI

```text
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
```

`init` 会从指定 workflow template 写出 starter `opt.workflow.json`。默认 `production-feature` 模板内置 planner、engineer、reviewer、release-manager 四类角色和一套生产交付流程。传入 `--team <id>` 后，会使用该可复用 team 推荐的模板，除非同时显式传入 `--template`，并在生成的 workflow 中记录 `organization.team` 和推荐 policy ids。传入 `--policy <id>` 会追加经过校验的组织级 policy packs；重复 policy 会按出现顺序去重。当所选 policy 含可自动化规则时(目前是 `security-baseline` 的 `dependency_audit`),`init` 会在最后一个阶段之前注入一个专门的 `policy_compliance` 阶段并带上对应的 command gate(例如 `npm:audit-high`),使该规则在验证时被真正强制执行,而不仅是写入文档。不可自动化的规则仍作为生成指令中的 advisory prompt 文本。它默认拒绝覆盖已有 workflow；需要覆盖时必须显式传入 `--force`。

默认 `production-feature` 模板使用内置 `node:test` 和 `node:coverage` presets，因此生成后的本地运行会要求目标仓库提供 `npm test` 和 `npm run test:coverage`。当模板包含基于 npm 的 command gates 且目标目录没有 `package.json` 时，`init` 会 scaffold 一个占位 `package.json`,其 `test` 和 `test:coverage` 脚本会以非零退出并打印「configure me」提示。这样 command gates 会锚定到目标仓库,而不是误命中无关的父级 `package.json`,并在你接入真实检查前诚实地失败。已存在的 `package.json` 不会被修改。如果目标是非 Node 项目或空 starter 目录，可以先使用 `--template minimal`，也可以用 workflow 内的 `gatePresets` 或 `--preset-file` 覆盖 command gates。

`validate` 会检查 workflow 结构、stage owner、gate preset、重复 id 和外部 preset registry，但不会写出任何生成资产。传入 `--json` 后会输出机器可读摘要，包括 workflow 标识、角色/阶段/gate 数量、gate 类型数量、角色列表和阶段 gate id。

`schema` 默认把 workflow JSON Schema 输出到 stdout；传入 `--out` 后会写入文件，并复用生成资产的覆盖保护逻辑。

`catalog` 会以文本或 JSON 列出内置聚合 catalog，包括 gate presets、workflow templates、组织级 policy packs 和可复用 agent teams。使用 `--out` 可以写出稳定 JSON artifact，供 Web Console、marketplace 或组织级 registry tooling 消费；已有文件需要 `--force` 才会覆盖。

`presets` 会以文本或 JSON 列出内置 gate preset catalog，方便设计组织级 workflow templates 和 policy registries。

`templates` 会以文本或 JSON 列出内置 workflow template catalog，这是组织级可复用交付流程的第一个本地构建块。

`policies` 会以文本或 JSON 列出内置组织级 policy packs，包括质量、人类管控和安全基线，后续可挂载到可复用 templates 和 workflows。

`teams` 会以文本或 JSON 列出可复用 agent team catalog，包括推荐角色组合，以及后续组织级 workflow 生成可使用的 template 和 policy 关联。

`marketplace` 会列出内置分发包元数据，覆盖可复用 skills、MCP server profiles 和 portable hook packages。使用 `--out` 可以写出 marketplace JSON artifact，用于后续 registry、Web Console package picker 或组织批准的包镜像。

生成文件：

- `AGENTS.md`
- `CLAUDE.md`
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
- `.tpan-opt-co-worker/marketplace.json`
- `.tpan-opt-co-worker/workflow.manifest.json`
- `.tpan-opt-co-worker/workflow.schema.json`
- `opencode.json`
- `scripts/list-runs.mjs`
- `scripts/run-workflow.mjs`
- `scripts/verify-workflow.mjs`

编译器会校验 workflow 结构，拒绝未知阶段 owner，拒绝重复 stage id，阻止路径穿越，并且默认不会覆盖已有文件；需要覆盖时必须显式传入 `--force`。

当 workflow 定义了 `organization.team` 或 `organization.policies` 时，生成的 harness 指令文件会包含 `Organization Standards` 区块，让 Codex、Claude Code、Cursor 和 OpenCode 获得同一套 team 与 policy 上下文。内置 policy packs 会在生成指令中展开为对应说明和 rule ids；自定义组织级 policy id 会保留为 policy 引用。

生成的 Claude Code 资产包含根级 `CLAUDE.md` 工作流上下文，以及每个 workflow role 对应的 `.claude/agents/<role>.md` 文件，让 Claude Code 可以按同一套角色边界、阶段、门禁和证据要求工作。

生成的 Cursor rule 位于 `.cursor/rules/tpan-opt-co-worker.mdc`，用于把 workflow 边界、门禁和验证方式放入 Cursor 的项目规则上下文。

生成的 OpenCode 资产包含 `opencode.json`，以及每个 workflow role 对应的 `.opencode/agents/<role>.md` subagent 文件。

生成的 `.tpan-opt-co-worker/workflow.manifest.json` 是面向本地 runner 和后续 adapter 的 harness-neutral manifest，会记录 organization 元数据、标准化角色、阶段、catalog 和 marketplace artifact 路径、harness 资产路径和统一验证命令。

生成的 `.tpan-opt-co-worker/workflow.schema.json` 是面向 workflow 编写工具、编辑器和后续 Web 控制台表单生成的 JSON Schema。

生成的 `.tpan-opt-co-worker/catalog.json`、`.tpan-opt-co-worker/marketplace.json` 和 `.tpan-opt-co-worker/console/catalog.js` 会暴露组织级 workflow templates、policy packs、可复用 teams，以及面向 skills、MCP servers 和 hooks 的 marketplace packages。

生成的 `.tpan-opt-co-worker/console/index.html` 是可直接在浏览器打开的静态 workflow console，用于查看 workflow 标识、organization team/policy 元数据、角色归属、阶段顺序、manual/command gate 分布，包含带标准化 workflow JSON、schema 路径、复制和下载入口的 Workflow Designer 种子面板，并展示可复用 templates/policies/teams 的 organization catalog 面板、marketplace package discovery、run summary 状态统计、可按状态筛选的 run history、每次 run 的 `evidence.json` 和 `summary.md` 直达链接，以及匹配筛选条件的每次 run gate details；gate details 会在可用时展示 command 文本、exit code、审批人、备注和安全 evidence links；`.tpan-opt-co-worker/console/runs.js` 为默认数据源，`.tpan-opt-co-worker/console/runs.json` 作为 fallback。

生成的本地 runner 会读取 manifest、调用验证脚本、写出标准 run 目录、更新 `.tpan-opt-co-worker/runs/index.json`，并把 run index 和 gate details 镜像到 `.tpan-opt-co-worker/console/runs.json` 和 `.tpan-opt-co-worker/console/runs.js` 供静态 console 使用：

```bash
node scripts/run-workflow.mjs \
  --run-id feature-001 \
  --manual-evidence examples/manual-evidence.json
```

runner 也会维护 `.tpan-opt-co-worker/runs/index.json`。可以用下面的命令查看本地 run history：

```bash
node scripts/list-runs.mjs
node scripts/list-runs.mjs --json
```

生成的 GitHub Actions workflow 会在 pull request 和 `main` push 时运行 `scripts/verify-workflow.mjs --run-dir .tpan-opt-co-worker/runs/ci`，并把 `.tpan-opt-co-worker/runs` 上传为 CI artifact，方便审计和 review。

生成的 GitLab CI job 会用 `--run-dir .tpan-opt-co-worker/runs/gitlab` 运行同一个验证脚本，并把 `.tpan-opt-co-worker/runs` 保存为 pipeline artifact。

Evidence report 结构：

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

Manual evidence 文件结构：

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

Workflow verification 会按 stage 顺序运行。如果某个较早 stage 的 command gate 失败，或 manual gate 仍然 pending，后续 stage 的 command gates 会被记录为 `skipped`，并且不会被执行。

当所有 command gates 通过，并且每个 manual gate 都有证据时，`allGatesPassed` 会变为 `true`。

当某个 manual gate id 在整个 workflow 中唯一时，manual evidence 可以直接用 gate id 作为 key。如果多个 stage 使用了同一个 manual gate id，请使用 `<stageId>.<gateId>` 作为 evidence key，避免一条审批证据被误用于多个 stage。

外部 preset registry 文件使用同样的 `gatePresets` 结构：

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

`--preset-file` 可以重复传入。多个文件之间，或文件和 workflow 之间出现重复自定义 preset 名称时会直接失败。

Gate 类型：

- `manual`：记录必须由人确认的审批、review 或证据项。
- `command`：由 `scripts/verify-workflow.mjs` 执行 shell 命令；如果命令返回非零退出码，验证脚本会失败。

内置 gate presets：

| Preset | 类型 | 命令 |
| --- | --- | --- |
| `node:test` | `command` | `npm test` |
| `node:coverage` | `command` | `npm run test:coverage` |
| `npm:lint` | `command` | `npm run lint` |
| `npm:typecheck` | `command` | `npm run typecheck` |
| `npm:audit-high` | `command` | `npm audit --audit-level=high` |

如果在 gate 上显式设置 `command`，会覆盖 preset 的默认命令。

Workflow 自定义 presets：

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

自定义 preset 名称不能覆盖内置 preset 名称。

## 路线图

- [x] 定义第一版 workflow schema。
- [x] 构建本地 workflow compiler。
- [x] 生成 `AGENTS.md`、harness 配置和 PR 模板。
- [x] 增加可执行 command gates 和人工证据 manual gates。
- [x] 增加测试、lint、typecheck 和 audit 的内置 gate presets。
- [x] 增加 CLI 内置 gate preset discovery。
- [x] 增加 workflow 内自定义 gate presets。
- [x] 增加外部组织级 preset registry 文件。
- [x] 增加生成式 workflow run evidence reports。
- [x] 增加 manual gate evidence input。
- [x] 增加 workflow run artifact directory management。
- [x] 增加 Codex harness adapter generation。
- [x] 增加 Claude Code harness adapter generation。
- [x] 增加 Cursor harness adapter generation。
- [x] 增加 OpenCode harness adapter generation。
- [x] 增加 harness-neutral workflow manifest generation。
- [x] 增加 manifest 和 Web Console organization 元数据输出。
- [x] 增加生成式 harness 指令中的 organization standards。
- [x] 将内置 organization policy pack rules 展开到生成式 harness 指令中。
- [x] 增加本地 runner harness adapter generation。
- [x] 增加 GitHub Actions template generation。
- [x] 增加 GitLab CI template generation。
- [x] 增加 starter workflow template generation。
- [x] 增加 CLI workflow template catalog discovery。
- [x] 增加 CLI organization policy pack discovery。
- [x] 增加 CLI reusable agent team catalog discovery。
- [x] 增加基于 team 推荐的 workflow 初始化。
- [x] 增加基于 policy packs 的 workflow 初始化。
- [x] 增加 CLI combined catalog discovery。
- [x] 增加 CLI combined catalog artifact export。
- [x] 增加不生成资产的 CLI workflow validation。
- [x] 增加 CLI workflow JSON Schema export。
- [x] 增加生成式静态 web console workflow overview。
- [x] 增加生成式 web console run history sync。
- [x] 增加生成式 web console workflow definition panel。
- [x] 增加生成式 web console run summary tracking。
- [x] 增加生成式 web console run status filters。
- [x] 增加生成式 web console status-filtered gate details。
- [x] 增加生成式 web console gate evidence metadata。
- [x] 增加生成式 web console run artifact links。
- [x] 增加 skills、MCP servers 和 hooks 的 marketplace catalog discovery。
- [x] 增加用于流程设计和执行追踪的 Web 控制台。
- [x] 增加组织级模板、策略和可复用 agent team。
- [x] 增加 skills、MCP servers 和 hooks 的 marketplace 式分发。

## 设计原则

- **Workflow-first**：流程必须明确、可复用、可版本化。
- **Verification-first**：没有证据的产物不应被信任。
- **Human-controlled**：敏感、外部、付费或不可逆动作必须由人类审批。
- **Harness-neutral**：工作流不应被某一个 AI 编码工具锁定。
- **Repository-native**：项目规则应能下发到代码仓库内部。
- **Composable**：角色、skills、hooks、MCP servers 和 gates 都应是可组合模块。
- **Auditable**：关键决策和质量结果必须可追踪。

## 灵感来源

TPAN-OPT/CO-WORKER 借鉴了以下方向的成熟模式：

- AI coding harness 与 agent framework
- workflow engine 与 CI/CD 系统
- 开源仓库治理实践
- 平台工程和内部开发者门户
- ECC 风格的 agent、skill、command、hook 和 MCP 组织方式

## 项目状态

当前项目处于早期实现阶段。现有 CLI 已能创建 starter workflow、编译仓库内 harness 资产、运行验证门禁，并持久化 workflow evidence。

## 参与贡献

初始 schema 和 runtime 边界发布后，欢迎参与贡献。

适合贡献的方向包括：

- workflow schema 设计
- harness adapter 设计
- agent role templates
- verification gates
- security policy templates
- 文档和示例
- 工作流设计与执行追踪的 UI/UX

## 许可证

本项目采用 [MIT License](LICENSE)。
