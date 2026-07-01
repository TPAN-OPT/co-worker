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

当前 package 是一个无外部依赖的 Node.js workflow compiler、本地 verifier、本地 runner、阶段门控执行编排器（execution orchestrator）和静态 workflow console。它会校验 JSON workflow 定义，生成仓库内 harness 资产，按阶段执行验证门禁，按阶段推进一个状态机——在第一个未满足的 gate 处停下并产出工单（work order）——记录证据，并把本地 run history 同步到生成的 console。

本文档中更完整的 team operating system 表述代表产品方向。执行编排器沿阶段依赖图路由和门控工作——把跨 owner 的独立分支并行调度——并可通过 opt-in、harness-neutral 的 `--invoke`/`--agent-command` 适配器驱动某阶段的 owner agent，但还不会并发执行 gate，也不会完全自主地协同多个 agent。托管式编排、marketplace package 安装闭环和 YAML authoring 目前还不属于当前 package 的实现范围。

## TPAN-OPT/CO-WORKER 提供什么

- **工作流设计器**：定义标准交付流程，包括阶段、角色、门禁、产物和审批。
- **Agent 团队构建器**：配置 planner、architect、engineer、reviewer、security reviewer、QA、release manager、documentation owner 等专业角色。
- **Skill / MCP / Hook 注册中心**：接入标准或自定义 skills、MCP servers、hooks、检查脚本、模板和自动化策略。
- **Harness 适配层**：把同一套工作流下发到 Codex、Claude Code、Cursor、OpenCode、GitHub Actions、本地 runner 或自研 agent harness。
- **质量验证门禁**：在流程推进前强制执行测试、lint、typecheck、覆盖率、E2E、安全审查、文档审查和人工审批。
- **证据链**：保存每次 workflow run 的产物、决策、测试结果、review 发现、截图、日志和审批记录。
- **OPT Runtime**：让一个负责人管控多个专业 agent，并通过明确的权限边界和审批点完成高质量交付。

## 快速开始

如果你本来就在 code agent(Claude Code、Codex、Cursor……)里工作,最短路径是**把 co-worker 装成插件,全程不离开你的 agent**。如果你想用纯命令行或写脚本,直接用 CLI(选项 B)。两种方式都需要 Node.js 22+。

### 选项 A —— 以插件方式安装(推荐给 agent 用户)

co-worker 自带一个零依赖的 MCP server,把整套流程暴露成可调用的工具,于是你的 agent 不用碰终端就能 scaffold、查看、驱动并批准一条受治理的 workflow。

**Claude Code** —— 直接从仓库安装：

```text
/plugin marketplace add https://github.com/TPAN-OPT/co-worker
/plugin install tpan-opt-co-worker@tpan-opt-co-worker
```

它会 clone 仓库并自动注册 `co-worker` MCP server(通过 `.mcp.json`)—— 无需 npm install、无需手动配置。然后只管对你的 agent 说话;本项目的核心——一个 lead 带一支 agent 团队跑一套受治理的流程——三步就能看到：

1. **Scaffold 并跑起团队** —— “用 `co_worker_quickstart` 在 `./my-repo` 里建一条 workflow。”它会生成 `opt.workflow.json`、编译全部 harness 资产,并用内置的离线 demo agent 把一支四角色团队(planner → engineer → reviewer → lead)端到端跑一遍。每个 agent 完成自己的阶段并写出一份工件;整条 run 停在唯一的人工审批 gate。
2. **看团队干了什么** —— 打开打印出的 `./my-repo/.tpan-opt-co-worker/console/index.html`。console 显示每个阶段都 `done`、一张填满的 agent 调用记录表,以及唯一一张打开的工单:等你审批。agent 写出的工件在 `./my-repo/.tpan-opt-co-worker/demo/artifacts/`。
3. **批准发布** —— “对 `./my-repo` 调用 `co_worker_approve`,批准 `ship` 阶段的 `human_approval` gate,审批人是我。”它会把你的批准记为证据、推进编排器,run 即 `done`。

这就是 OPT 闭环的缩影:agent 干活,人只批最关键的那道 gate。

**用真实 agent 跑同一条流程。** 如果你装了 agent CLI（`claude`、`codex` 或 `cursor-agent`），加 `--real` —— quickstart 会检测到它并驱动真实 agent 代替离线 demo，于是四个阶段在 `.tpan-opt-co-worker/artifacts/<stage>.md` 产出真实工作，并仍然停在唯一的人工 gate：

```bash
tpan-opt-co-worker quickstart --out . --real --force
tpan-opt-co-worker approve human_approval --stage ship --by you --run-id real
```

用 `--agent codex` 指定某个 agent。若 PATH 上没有受支持的 agent，quickstart 会明确告知并改跑离线 demo；默认运行始终把工件标注为离线占位，好让你分辨演示与真实产出。`--real` 本质上就是编排器 agent-neutral 的 `--invoke`/`--agent-command` 适配器——只要该阶段出现有实质内容的工件（无论谁写的）gate 就通过，所以你也可以手动驱动：

```bash
node scripts/orchestrate-workflow.mjs --run-id real --invoke --loop \
  --agent-command 'claude -p "你是 {role}。依据 brief {brief} 完成阶段 {stage},把结果写入 .tpan-opt-co-worker/artifacts/{stage}.md"'
```

把 `claude -p` 换成 `codex exec`、`cursor-agent` 或任意 agent CLI 即可——编排器会替换 `{stage}` / `{role}` / `{brief}` / `{skills}` / `{mcpServers}` / `{hooks}`,并对每个就绪阶段执行一次。把命令提交进 workflow 的 `orchestration.agentCommand`(`wizard` 会询问它),之后的 `--invoke` 就无需任何附加参数。

**Codex / Cursor / 其他 MCP agent** —— 先 clone 仓库,再把 agent 指向本地 server。具体的 `config.toml` / JSON 见[以插件方式安装（MCP）](#以插件方式安装mcp),然后让 agent 跑同一条 `co_worker_quickstart` → `co_worker_approve` 链路。

### 选项 B —— 直接用 CLI

快速开始就是一条命令——从空目录到一次真实的 agent 团队运行：

```bash
node src/cli.js quickstart --out /path/to/target-repo --name my-workflow
```

它会生成 `opt.workflow.json`、编译全部 harness 资产、内置一个离线 demo agent,并把一支四角色团队(planner → engineer → reviewer → lead)端到端跑一遍:每个 agent 完成自己的阶段并写出工件,整条 run 停在唯一的人工审批 gate。它会替你打开 console(加 `--no-open` 可跳过),或打开它打印出的路径：

```bash
open /path/to/target-repo/.tpan-opt-co-worker/console/index.html
```

console 显示每个阶段都 `done`、一张填满的 agent 调用记录表,以及唯一一张打开的工单——你的审批——所以你在学习任何其他命令之前,就先看到一支 agent 团队真的交付了工作。这次默认运行用的是内置的**离线 demo agent**——它写出的工件(在 `.tpan-opt-co-worker/demo/artifacts/`)是标注了的占位内容,而非真实工作。加 `--real` 改用已安装的 agent CLI(`claude`/`codex`/`cursor-agent`)产出真实内容;若命令在你的 PATH 上检测到 agent,它还会打印出用来真实重跑的那一行 `--real` 命令。加 `--no-demo` 只 scaffold 不跑团队;或用 `--template production-feature` 选带真实检查 gate 的交付 workflow。

agent 能做的都做完了,只剩一道人工审批。一条命令收尾(与 `co_worker_approve` MCP 工具共享同一套核心,所以命令行与 agent 内行为完全一致)：

```bash
node src/cli.js approve human_approval --stage ship --by you@example.com --out /path/to/target-repo
```

`approve` 会把审批人记为证据并把编排器推进到 `done`。任何时候想看某次 run:`node src/cli.js status --out …` 显示每个阶段进展,`node src/cli.js next --out …` 返回打开的工单和下一步动作。

要修改 workflow,在 console Designer(或 `opt.workflow.json`)里编辑,然后重新应用：

```bash
node src/cli.js compile --workflow /path/to/target-repo/opt.workflow.json --out /path/to/target-repo --force
```

### 看到每个能力的实际效果

quickstart 生成的仓库里,「TPAN-OPT/CO-WORKER 提供什么」列出的每一项都已经有一个可跑的示例。`node src/cli.js …` 在本工具目录里运行;`node scripts/…` 在生成的目标仓库里运行：

- **工作流设计器** —— 在 console Designer 面板或 `opt.workflow.json` 里编辑阶段、角色、门禁和审批,然后校验：`node src/cli.js validate --workflow /path/to/target-repo/opt.workflow.json`。
- **Agent 团队构建器** —— 每个角色都会编译成各 harness 的 agent 文件(`.claude/agents/<role>.md`、`.codex/agents/<role>.toml`、`.opencode/agents/<role>.md`);用 `node src/cli.js teams` 浏览可复用 team。
- **Skill / MCP / Hook 注册中心** —— `node src/cli.js catalog` 列出 templates、policy packs 和 teams;用 `--kind marketplace`(skills、MCP servers、hooks)或 `--kind presets`(gate presets)只看其中一类。
- **Harness 适配层** —— 同一套工作流下发到每个 harness;用 `ls .codex .claude .cursor opencode.json .github/workflows scripts` 查看生成的文件。
- **质量验证门禁** —— `node scripts/verify-workflow.mjs` 执行各阶段门禁,并在第一个失败或未满足的门禁处停下。
- **证据链** —— `node scripts/run-workflow.mjs --run-id local` 记录 `.tpan-opt-co-worker/runs/local/evidence.json` 和 `summary.md`。
- **OPT Runtime** —— `node src/cli.js status` / `next` / `approve` 把各阶段在不同 owner 间路由、产出下一张工单,并从命令行推进 gate(它驱动的正是 quickstart demo 所 seed 的那次编排;`node scripts/orchestrate-workflow.mjs --run-id local` 是底层脚本)。

### 更多命令（参考）

下面这些命令对同一条流水线提供更细的控制;完整命令面见下文 [Current CLI](#current-cli)。要开发本仓库本身,运行 `npm test`。

以交互方式配置一条 workflow —— 模板、团队、策略包、MCP server 和生命周期 hook —— 然后一次性写出 `opt.workflow.json` 并编译全部 harness 资产：

```bash
node src/cli.js wizard --out /path/to/target-repo
```

向导会依次询问 starter 模板、可选的复用团队、组织策略包、若干 MCP server（本地 `command` + `args` + `env`,或远程 `url` + transport)、每个 server 分配给哪些 role,以及若干生命周期 hook（`pre-tool`、`post-tool`、`stop`、`user-prompt-submit`、`session-start`,工具事件可附可选的 tool matcher)。随后它会和常规 harness 资产一起编译出 `.mcp.json`、`.codex/config.toml` 的 MCP 接线,以及 `.claude/settings.json` 的 hook。向导产出的 schema 见[工作流节点：MCP server 与 hook](#工作流节点mcp-server-与-hook)。

在目标仓库中创建 starter workflow（不编译、不跑 demo）：

```bash
node src/cli.js init --out /path/to/target-repo --name production-feature-workflow
```

初始化 workflow 前浏览内置 catalog。catalog 是唯一的发现入口 —— 用 `--kind`
只看其中一类：

```bash
node src/cli.js catalog                       # 聚合概览
node src/cli.js catalog --json                # 聚合、机器可读
node src/cli.js catalog --out catalog.json    # 写出聚合产物
node src/cli.js catalog --kind templates      # 仅 workflow templates
node src/cli.js catalog --kind policies       # 组织级 policy packs
node src/cli.js catalog --kind teams          # 可复用 agent teams
node src/cli.js catalog --kind presets        # gate presets
node src/cli.js catalog --kind marketplace    # marketplace 包(预览)
```

原有的 `templates` / `policies` / `teams` / `presets` / `marketplace` 子命令仍然可用,
它们是对应 `catalog --kind` 的别名。

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
node src/cli.js catalog --kind presets
node src/cli.js catalog --kind presets --json
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

打开生成的静态 workflow console。它会立即展示 workflow overview 和可编辑的 Workflow Designer 面板（带浏览器内草稿校验与 JSON 导出），并在本地 workflow run 生成 `.tpan-opt-co-worker/console/runs.json` 和 `.tpan-opt-co-worker/console/runs.js` 后展示 run summary、带 evidence artifact 链接且可按状态筛选的 run history，以及带 command exit code 和人工证据元数据的同步筛选 gate details。

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

## 以插件方式安装（MCP）

co-worker 自带一个零依赖的 MCP server(`tpan-opt-co-worker mcp`,stdio 上的换行分隔 JSON-RPC),把能力暴露成可调用 tool —— `co_worker_quickstart`、`co_worker_compile`、`co_worker_validate`、`co_worker_catalog`、`co_worker_next`、`co_worker_approve` —— 于是任何支持 MCP 的 code agent 都能在 agent 内部完成 scaffold、配置、驱动和审批。

**Claude Code** —— 以插件安装：

```text
/plugin marketplace add https://github.com/TPAN-OPT/co-worker
/plugin install tpan-opt-co-worker@tpan-opt-co-worker
```

插件会自动注册 `co-worker` MCP server(通过 `.mcp.json`)。

**Codex** —— 先 clone 仓库,再让 `~/.codex/config.toml` 指向本地 server：

```toml
[mcp_servers.co-worker]
command = "node"
args = ["/absolute/path/to/co-worker/src/cli.js", "mcp"]
```

**其他支持 MCP 的 agent(Cursor、国产 code agent、自研 runner)** —— 指向同一个本地 server：

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

> 包尚未发布到 npm。发布后,上面 Codex 与通用配置即可改用 `command: "npx"`、`args: ["-y", "tpan-opt-co-worker", "mcp"]`,不必再写本地 clone 的绝对路径。Claude Code 插件路径无需 npm 发布 —— 它直接从仓库安装。

然后在 agent 里,让它调用 `co_worker_quickstart` 生成一个已填充的 console、`co_worker_next` 查看打开的工单、`co_worker_approve` 批准某个人工 gate 并推进 —— 不用再手写 evidence 文件。只读仓库文件的 agent,仍可通过生成的 `CLAUDE.md`、`.codex/`、`.cursor/`、`opencode.json` 接入。

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

### 两种模式:同一套工作流,两种下发方式

你只设计**一套**工作流 —— 大环节、小节点、门禁,以及每一步用哪些工具。顶层的 `mode` 字段只决定*把它交给谁*:

- **`mode: opt`**(默认)—— 交给 code agent。编译会生成全部 agent harness(Claude Code、Codex、Cursor、OpenCode)以及 playbook。用编排器驱动它们:
  `node scripts/orchestrate-workflow.mjs --invoke --loop` 会自动逐阶段推进,直到遇到人工门禁,并在每一步把该步骤的 skills/MCP/hooks 作用域下放给 agent。
- **`mode: team`** —— 交给人类队友。编译会生成 **`PLAYBOOK.md`**(以及核心资产),但跳过人类不会打开的 agent-CLI 文件 —— 一份可直接照着做的清单,每个人在自己的产品或模块上跑完整流程。用 **`tpan-opt-co-worker dashboard`** 把所有人并排汇总(每个模块一次带标签的运行)。

定义完全相同,只是下发目标 —— 以及 `compile` 因此写出哪些文件 —— 不同。随时可用 `compile --harness` 覆盖 mode 的默认。

一个大环节可以包含**小节点**(例如 `ai-test` → `unit`、`integration`、`user-acceptance`),大环节或小节点都能绑定各自的 `skills`、`mcpServers`、`hooks`。在 `--invoke` 时,这些绑定通过三种方式到达 agent:工单 brief JSON、`TPAN_OPT_SKILLS` / `TPAN_OPT_MCP_SERVERS` / `TPAN_OPT_HOOKS` 环境变量,以及 `{skills}` / `{mcpServers}` / `{hooks}` 命令占位符。

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

大环节可以嵌套小节点、按步骤绑定工具,顶层 `mode` 选择下发目标:

```yaml
mode: team            # 或 opt(默认)。两种模式定义完全相同。

stages:
  - id: ai-test
    owner: engineer
    skills: [test-strategy]          # 大环节级工具
    nodes:
      - id: unit
        skills: [unit-testing]       # 小节点级工具,--invoke 时下放
        gates: [{ id: unit-pass, preset: node:test }]
      - id: user-acceptance
        gates: [{ id: uat-signoff, type: manual }]
```

## 核心对象

| 对象 | 作用 |
| --- | --- |
| `WorkflowTemplate` | 可复用的团队交付流程。 |
| `WorkflowRun` | 某个任务或项目上的一次流程执行。 |
| `Stage` | 工作流阶段（大环节），包含输入、输出、负责人、门禁，以及可选的小节点。 |
| `Node` | 阶段内的小节点（如 `ai-test` → `unit`/`integration`），有自己的输出、门禁和绑定的 skills/MCP/hooks。 |
| `Role` | 人类或 agent 的职责边界。 |
| `AgentProfile` | 具体 agent 配置，包括 skills、工具、权限和行为规则。 |
| `Skill` | 针对某个能力的可复用指令包。 |
| `McpServer` | 面向特定角色开放的工具或数据连接器。 |
| `Hook` | 在工作流执行前、中、后触发的自动化逻辑。 |
| `Gate` | 流程推进前必须满足的条件。 |
| `Playbook` | `PLAYBOOK.md`，`team` 模式下队友从头到尾照着执行的可读清单。 |
| `Artifact` | 可持久化产物，例如计划、规格说明、代码补丁、测试报告、review 或发布说明。 |
| `VerificationResult` | 某个门禁通过或失败的证据。 |
| `Approval` | 人类对敏感或不可逆动作的确认。 |

## 工作流节点：MCP server 与 hook

skill 按 role 配置;MCP server 和生命周期 hook 则是一等的工作流节点:在顶层声明一次,再按 role 引用 server。`wizard` 命令会交互式收集这些内容,你也可以在 `opt.workflow.json` 里手写：

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

- **`mcpServers`** 是从 server id 到「本地进程(`command`、可选 `args`、可选 `env`)」或「远程端点(`url`、可选 `transport` —— `stdio`/`sse`/`http`)」的映射。一个 server 要么本地、要么远程(互斥)。每个 role 可在 `roles.<id>.mcpServers` 中列出分配的 server id,且必须引用已声明的 server。
- **`hooks`** 是 `{ id, event, command }` 的数组,`event` 取 `pre-tool`、`post-tool`、`stop`、`user-prompt-submit`、`session-start` 之一。工具事件(`pre-tool`/`post-tool`)可附可选的 `matcher` 按工具名限定范围。每个 `id` 必须是唯一标识符。

当 workflow 声明了任一节点,编译会额外产出 harness 原生资产：

- `.mcp.json`(Claude Code / 通用 MCP)以及 `.codex/config.toml` 中的 `[mcp_servers.*]` 表,外加 `AGENTS.md` 和各 agent 文件中按 role 的 MCP 列表。
- `.claude/settings.json`(Claude Code 原生 hook,按 `PreToolUse`/`PostToolUse`/`Stop`/`UserPromptSubmit`/`SessionStart` 分组)以及一份 harness 中立的 `.tpan-opt-co-worker/hooks.json` manifest,外加 `AGENTS.md` 中的 `## Hooks` 小节。

没有声明任一节点的 workflow 编译结果与以前逐字节一致,因此这些文件只在你选择启用时才出现。

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
- `PLAYBOOK.md`（人类队友清单;team 模式的下发产物）
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
GitHub Actions 会在 `main` push 和 pull request 中用 Node.js 22 运行同一套质量门禁。

## 当前 CLI

```text
tpan-opt-co-worker quickstart --out . [--template opt-demo] [--team product-delivery] [--name my-workflow] [--no-demo] [--no-open] [--force]
tpan-opt-co-worker wizard --out . [--force]
tpan-opt-co-worker init --out . [--template production-feature] [--team product-delivery] [--policy quality-standard] [--name production-feature-workflow] [--force]
tpan-opt-co-worker validate --workflow opt.workflow.json [--preset-file gate-presets.json] [--json]
tpan-opt-co-worker schema [--out workflow.schema.json] [--force]
tpan-opt-co-worker catalog [--kind presets|templates|policies|teams|marketplace] [--json] [--out catalog.json] [--force]
tpan-opt-co-worker compile --workflow opt.workflow.json --out . [--harness claude|codex|cursor|opencode|team] [--preset-file gate-presets.json] [--force] [--dry-run]
tpan-opt-co-worker status [--out .] [--run-id <id>]
tpan-opt-co-worker next [--out .] [--run-id <id>]
tpan-opt-co-worker dashboard [--out .]
tpan-opt-co-worker approve <gate> --by <approver> [--stage <stage>] [--note <text>] [--out .] [--run-id local]
tpan-opt-co-worker mcp
```

`status`、`next`、`dashboard`、`approve` 用于在命令行里驱动一个已编译的仓库。`status` 打印 workflow 和每个阶段的编排状态(在 `team` 模式下还会指向 `PLAYBOOK.md`);`next` 打印打开的工单和下一步动作;两者默认看最新一次运行,并接受 `--run-id <id>` 查看某一次具体的编排运行(例如真实 agent 调用产生的 `real` 运行);`dashboard` 把每个产品/模块的最新一次验证运行并排汇总成一张表 —— 这是 team 模式的视角:每个队友在不同模块上跑同一套流程(用 `node scripts/run-workflow.mjs --module <名称>` 给运行打标签);`approve <gate> --by <approver>` 为某个人工 gate 记录审批证据并推进编排器 —— 这样你就不用手写 `manual-evidence.json`。当某个 gate id 在多个阶段复用时,加 `--stage`。它们与 MCP 的 `co_worker_next` / `co_worker_approve` 共用核心,所以 CLI 与 agent 内的行为一致。`mcp` 启动 MCP server(见 [以插件方式安装（MCP）](#以插件方式安装mcp)）。

`quickstart` 是一条命令的引导式上手路径:它先做和 `init` 相同的 scaffold,编译全部 harness 资产,内置一个离线 demo agent,并(除非 `--no-demo`)用 `--invoke` 把一支四角色 agent 团队端到端跑一遍,于是打开生成的 console 时它已是一次真实、填满的运行,停在唯一的人工审批 gate。它默认用 `opt-demo` 模板(一支可运行的 agent 团队),并会替你打开 console(除非加 `--no-open`)。用 `approve human_approval --stage ship --by you` 收尾这次运行。应用编辑后的 workflow 仍以 CLI `compile` 为权威路径。

`wizard` 是交互式编排路径:它依次询问模板、可选复用团队、policy packs、MCP server、按 role 的 MCP 分配、生命周期 hook,以及一个可选的编排器 agent 命令(提交为 `orchestration.agentCommand`,使 `orchestrate --invoke` 无需附加参数即可驱动每个阶段的 owner agent),然后写出 `opt.workflow.json` 并把全部 harness 资产(包括 `.mcp.json`、`.codex/config.toml` 的 MCP 接线和 `.claude/settings.json` 的 hook)编译到 `--out`。每个 `[默认值]` 直接回车即可接受;选择题可按编号或 id 作答。它产出的 schema 见[工作流节点：MCP server 与 hook](#工作流节点mcp-server-与-hook)。它默认拒绝覆盖已有文件,需要时显式传入 `--force`。

`init` 会从指定 workflow template 写出 starter `opt.workflow.json`。默认 `production-feature` 模板内置 planner、engineer、reviewer、release-manager 四类角色和一套生产交付流程。传入 `--team <id>` 后，会使用该可复用 team 推荐的模板，除非同时显式传入 `--template`，并在生成的 workflow 中记录 `organization.team` 和推荐 policy ids。传入 `--policy <id>` 会追加经过校验的组织级 policy packs；重复 policy 会按出现顺序去重。当所选 policy 含可自动化规则时(目前是 `security-baseline` 的 `dependency_audit`),`init` 会在最后一个阶段之前注入一个专门的 `policy_compliance` 阶段并带上对应的 command gate(例如 `npm:audit-high`),使该规则在验证时被真正强制执行,而不仅是写入文档。不可自动化的规则仍作为生成指令中的 advisory prompt 文本。它默认拒绝覆盖已有 workflow；需要覆盖时必须显式传入 `--force`。

默认 `production-feature` 模板使用内置 `node:test` 和 `node:coverage` presets，因此生成后的本地运行会要求目标仓库提供 `npm test` 和 `npm run test:coverage`。当模板包含基于 npm 的 command gates 且目标目录没有 `package.json` 时，`init` 会 scaffold 一个占位 `package.json`,其 `test` 和 `test:coverage` 脚本会以非零退出并打印「configure me」提示。这样 command gates 会锚定到目标仓库,而不是误命中无关的父级 `package.json`,并在你接入真实检查前诚实地失败。已存在的 `package.json` 不会被修改。如果目标是非 Node 项目或空 starter 目录，可以先使用 `--template minimal`，也可以用 workflow 内的 `gatePresets` 或 `--preset-file` 覆盖 command gates。

`validate` 会检查 workflow 结构、stage owner、gate preset、重复 id 和外部 preset registry，但不会写出任何生成资产。传入 `--json` 后会输出机器可读摘要，包括 workflow 标识、角色/阶段/gate 数量、gate 类型数量、角色列表和阶段 gate id。

`schema` 默认把 workflow JSON Schema 输出到 stdout；传入 `--out` 后会写入文件，并复用生成资产的覆盖保护逻辑。

`catalog` 会以文本或 JSON 列出内置聚合 catalog，包括 gate presets、workflow templates、组织级 policy packs 和可复用 agent teams。使用 `--out` 可以写出稳定 JSON artifact，供 Web Console、marketplace 或组织级 registry tooling 消费；已有文件需要 `--force` 才会覆盖。

`presets` 会以文本或 JSON 列出内置 gate preset catalog，方便设计组织级 workflow templates 和 policy registries。

`templates` 会以文本或 JSON 列出内置 workflow template catalog，这是组织级可复用交付流程的第一个本地构建块。

`policies` 会以文本或 JSON 列出内置组织级 policy packs，包括质量、人类管控和安全基线，后续可挂载到可复用 templates 和 workflows。

`teams` 会以文本或 JSON 列出可复用 agent team catalog，包括推荐角色组合，以及后续组织级 workflow 生成可使用的 template 和 policy 关联。

`marketplace` 会列出内置分发包元数据，覆盖可复用 skills、MCP server profiles 和 portable hook packages。这仅是元数据预览:包安装尚未实现,所引用的 `install.files` 只是描述性目标,并非已随包发布的资产。使用 `--out` 可以写出 marketplace JSON artifact，用于后续 registry、Web Console package picker 或组织批准的包镜像。

生成文件：

- `AGENTS.md`
- `CLAUDE.md`
- `PLAYBOOK.md`（人类队友清单;team 模式的下发产物）
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

默认情况下,`compile` 在 `opt` 模式生成全部 harness,在 `team` 模式只生成队友 playbook。传入 `--harness <claude|codex|cursor|opencode|team>`(逗号分隔、可重复)只写出你实际使用的 harness 文件 —— 核心资产(workflow manifest、schema、静态 console、scripts、CI)始终生成。这样仓库就不会被 ~30 个永远不会打开的文件塞满。

编译器会校验 workflow 结构，拒绝未知阶段 owner，拒绝重复 stage id，阻止路径穿越，并且默认不会覆盖已有文件；需要覆盖时必须显式传入 `--force`。

当 workflow 定义了 `organization.team` 或 `organization.policies` 时，生成的 harness 指令文件会包含 `Organization Standards` 区块，让 Codex、Claude Code、Cursor 和 OpenCode 获得同一套 team 与 policy 上下文。内置 policy packs 会在生成指令中展开为对应说明和 rule ids；自定义组织级 policy id 会保留为 policy 引用。

生成的 Claude Code 资产包含根级 `CLAUDE.md` 工作流上下文，以及每个 workflow role 对应的 `.claude/agents/<role>.md` 文件，让 Claude Code 可以按同一套角色边界、阶段、门禁和证据要求工作。

生成的 Cursor rule 位于 `.cursor/rules/tpan-opt-co-worker.mdc`，用于把 workflow 边界、门禁和验证方式放入 Cursor 的项目规则上下文。

生成的 OpenCode 资产包含 `opencode.json`，以及每个 workflow role 对应的 `.opencode/agents/<role>.md` subagent 文件。

生成的 `.tpan-opt-co-worker/workflow.manifest.json` 是面向本地 runner、执行编排器和后续 adapter 的 harness-neutral manifest，会记录 organization 元数据、标准化角色、阶段、catalog 和 marketplace artifact 路径、harness 资产路径（包括 `harnesses.orchestrator` 下的编排器脚本及其状态目录）和统一验证命令。

生成的 `.tpan-opt-co-worker/workflow.schema.json` 是面向 workflow 编写工具、编辑器和后续 Web 控制台表单生成的 JSON Schema。

生成的 `.tpan-opt-co-worker/catalog.json`、`.tpan-opt-co-worker/marketplace.json` 和 `.tpan-opt-co-worker/console/catalog.js` 会暴露组织级 workflow templates、policy packs、可复用 teams，以及面向 skills、MCP servers 和 hooks 的 marketplace packages。

生成的 `.tpan-opt-co-worker/console/index.html` 是可直接在浏览器打开的静态 workflow console，用于查看 workflow 标识、organization team/policy 元数据、角色归属、阶段顺序、manual/command gate 分布，包含一个可编辑的 Workflow Designer 面板：它在浏览器中按与 compiler 相同的结构规则（名称、角色、owner、阶段依赖、gate）校验 workflow 草稿，并提供编辑后 JSON 的复制与下载——而 CLI `compile` 仍是写入资产的权威校验器——同时给出 schema 路径，并展示可复用 templates/policies/teams 的 organization catalog 面板、marketplace package discovery、run summary 状态统计、可按状态筛选的 run history、每次 run 的 `evidence.json` 和 `summary.md` 直达链接，以及匹配筛选条件的每次 run gate details；gate details 会在可用时展示 command 文本、exit code、审批人、备注和安全 evidence links；`.tpan-opt-co-worker/console/runs.js` 为默认数据源，`.tpan-opt-co-worker/console/runs.json` 作为 fallback。

生成的本地 runner 会读取 manifest、调用验证脚本、写出标准 run 目录、更新 `.tpan-opt-co-worker/runs/index.json`，并把 run index 和 gate details 镜像到 `.tpan-opt-co-worker/console/runs.json` 和 `.tpan-opt-co-worker/console/runs.js` 供静态 console 使用：

```bash
node scripts/run-workflow.mjs \
  --run-id feature-001 \
  --module payments \
  --manual-evidence examples/manual-evidence.json
```

`--module <名称>` 给这次运行打上它覆盖的产品/模块标签,于是 `tpan-opt-co-worker dashboard`(以及 console)能按模块分组 —— 这就是 team 模式的形态:每个队友在自己那块上跑同一套流程。runner 也会维护 `.tpan-opt-co-worker/runs/index.json`。可以用下面的命令查看本地 run history：

```bash
node scripts/list-runs.mjs
node scripts/list-runs.mjs --json
```

生成的执行编排器是一个依赖门控状态机。与全局评估所有 command gate 的 verifier 不同，编排器只在某阶段的全部依赖都已 done 时才启动它，并为每个依赖已满足的阶段产出工单：角色的 skills 与 permissions、要驱动的各 harness agent 文件（`.claude/agents/<role>.md`、`.codex/agents/<role>.toml`、`.opencode/agents/<role>.md`）、该阶段的 required 工作、待办 gate 以及下一步动作。状态会写入 `.tpan-opt-co-worker/orchestrations/<run-id>/state.json` 和人类可读的 `state.md`。工作流被阻断时脚本以非零码退出，只有全部阶段完成才返回 0，因此可用于门控 CI：

```bash
node scripts/orchestrate-workflow.mjs \
  --run-id feature-001 \
  --manual-evidence examples/manual-evidence.json
```

加 `--invoke` 可驱动每个就绪阶段的 owner agent(配合 `--agent-command "<命令>"`,或工作流里持久化的 `orchestration.agentCommand`);加 `--loop` 则反复执行调度,直到运行完成、卡在某个待处理的人工 gate、或达到 `--max-iterations`(默认 25)。这就是 OPT 自动驾驶:agent 推进流程,只在人工 gate 处停下。每次调用都会被作用域限定到该阶段+小节点的工具,通过 brief JSON、`TPAN_OPT_SKILLS` / `TPAN_OPT_MCP_SERVERS` / `TPAN_OPT_HOOKS` 环境变量,以及 `{skills}` / `{mcpServers}` / `{hooks}` 命令占位符传入。agent 永远不能自行批准人工 gate。

阶段用可选的 `dependsOn`（一组更早的 stage id）声明依赖；由于一个阶段只能依赖在它之前声明的阶段，这个数组始终是合法的拓扑序（不可能成环）。省略 `dependsOn` 时，阶段默认依赖紧邻的前一个阶段，因此一串普通阶段仍然严格串行——路由与审批边界仍位于第一个未满足的阶段，行为与之前完全一致。一旦声明依赖，阶段列表就变成 DAG：从同一前置阶段分叉出来的阶段会被并行调度，于是多个 owner 可以同时持有打开的工单（`state.currentStages` / `state.workOrders` 携带完整集合，`currentStage` / `workOrder` 保留为第一个前沿以兼容旧消费者）。任何依赖未完成的阶段都保持 `pending`，其 command gate 不会运行。用显式的空 `dependsOn: []` 让某阶段跳出串行默认、作为独立分支从头开始。

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

单进程内 command gate 仍然顺序执行（编排器尚未并发执行 gate）；这里的并行指的是独立分支会被一起路由并呈现，而不是被人为地串行卡在第一个未完成的阶段之后。

编排器还可以驱动当前阶段的 owner agent。传入 `--invoke` 和一个 harness-neutral 的 `--agent-command` 命令模板后，编排器在到达未满足的阶段时，会把工单 brief 写入 `brief-<stage>.json`，为该阶段的 owner **执行一次**该命令，然后重新评估该阶段的 gate，若已通过则推进。命令模板会替换 `{stage}`、`{role}`、`{brief}`，同样的值也会通过 `TPAN_OPT_STAGE`、`TPAN_OPT_ROLE`、`TPAN_OPT_BRIEF` 环境变量导出，因此任意 agent CLI（Claude Code、Codex、OpenCode 或自研 runner）都能接入，而不会把工作流锁死到某一家 harness：

```bash
node scripts/orchestrate-workflow.mjs \
  --run-id feature-001 \
  --manual-evidence examples/manual-evidence.json \
  --invoke \
  --agent-command 'claude -p "Complete stage {role} using brief {brief}"'
```

agent 调用是 opt-in 的：因为它会改动仓库且有成本，所以每个阶段每次运行**最多调用一次**，并且**永远不会满足 manual gate**——agent 不能自我审批，人工审批门在补充证据前仍然阻断。每次调用都会记录到 `invocation-<stage>.json` 和本次运行的 `state.json`。

agent 命令也可以持久化进 workflow，这样就不必每次运行都重新输入。在 workflow 中加一个 `orchestration` 块：用 `agentCommand` 指定默认命令模板，用可选的 `agents` 按角色覆盖；compiler 会校验它并写入 manifest 的 `harnesses.orchestrator`。编排器随后按以下优先级为每个阶段 owner 解析命令：CLI `--agent-command` → 按角色的 `agents[owner]` → 默认 `agentCommand`。因此当 workflow 里已提交命令时，`--invoke` 无需任何附加参数即可工作，而 CLI flag 仍可为一次性运行覆盖它：

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

编排器还会把最新状态镜像到静态 console 的 `.tpan-opt-co-worker/console/orchestration.json` 和 `.tpan-opt-co-worker/console/orchestration.js`。console 的 Orchestration 面板会渲染运行状态、当前阶段、各阶段进度、打开的工单（owner、待办 gate、下一步动作）以及最近的 agent 调用；`orchestration.js` 为默认数据源，`orchestration.json` 作为 fetch fallback。

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
- [x] 增加阶段门控执行编排器：路由工作并按阶段产出工单。
- [x] 增加 opt-in、harness-neutral 的 agent 调用：驱动当前阶段的 owner agent 并重新门控。
- [x] 将编排器 agent 命令（默认与按角色）持久化进 workflow 和 manifest。
- [x] 通过阶段依赖图并行调度独立阶段，支持多 owner 工单。
- [x] 在静态 Web Console 中呈现编排状态、工单和 agent 调用。
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
- [x] 让 Web Console Workflow Designer 可编辑：支持浏览器内草稿校验与 JSON 导出。
- [x] 增加一条命令的 quickstart：scaffold、编译并 seed 一个 demo run，让 console 立即填充可用。
- [x] 提供零依赖 MCP server（quickstart、compile、validate、catalog、next、approve），让 co-worker 以插件方式接入 Codex、Claude Code 和支持 MCP 的 agent。
- [x] 增加一等的 `status`、`next`、`approve` CLI 子命令：无需手写 evidence 文件即可驱动并审批工作流。
- [x] 增加 skills、MCP servers 和 hooks 的 marketplace catalog discovery。
- [x] 增加用于流程设计和执行追踪的 Web 控制台。
- [x] 增加组织级模板、策略和可复用 agent team。
- [x] 增加 skills、MCP servers 和 hooks 的 marketplace 式分发。
- [x] 将独立的发现命令收敛为 `catalog --kind`(保留向后兼容别名)。
- [x] 增加 `compile --harness`,使仓库只生成自己会用到的 harness 文件。
- [x] 按 `mode` 分叉生成产物:`team` 生成人类 playbook,`opt` 生成 agent harness。

### 计划中(尚未包含在当前包内)

以下内容在本 README 中作为方向描述,但**尚未**发布:

- Marketplace **包安装** —— `catalog --kind marketplace` 仅为元数据预览,`install.files`
  是描述性目标,并非已随包发布的资产。
- **YAML** workflow 编写 —— 编译器目前只读取 JSON workflow 文件。
- **托管编排(Hosted orchestration)** —— 将编排器作为托管服务运行,而非本地脚本,
  以及完全自主的多 agent 协调。

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
