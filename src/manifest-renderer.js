export function renderWorkflowManifest(workflow) {
  const roleIds = Object.keys(workflow.roles)
  const manifest = {
    schemaVersion: 'tpan-opt-co-worker.workflow.manifest/v1',
    schema: '.tpan-opt-co-worker/workflow.schema.json',
    workflow: {
      name: workflow.name,
      version: workflow.version
    },
    ...(workflow.organization ? { organization: workflow.organization } : {}),
    roles: workflow.roles,
    stages: workflow.stages,
    harnesses: {
      codex: {
        config: '.codex/config.toml',
        agents: Object.fromEntries(
          roleIds.map((roleId) => [roleId, `.codex/agents/${roleId}.toml`])
        )
      },
      claudeCode: {
        context: 'CLAUDE.md',
        agents: Object.fromEntries(
          roleIds.map((roleId) => [roleId, `.claude/agents/${roleId}.md`])
        )
      },
      cursor: {
        rules: ['.cursor/rules/tpan-opt-co-worker.mdc']
      },
      openCode: {
        config: 'opencode.json',
        agents: Object.fromEntries(
          roleIds.map((roleId) => [roleId, `.opencode/agents/${roleId}.md`])
        )
      },
      ci: {
        githubActions: '.github/workflows/tpan-opt-co-worker-verify.yml',
        gitlabCi: '.gitlab-ci.yml'
      },
      localRunner: {
        script: 'scripts/run-workflow.mjs',
        listRunsScript: 'scripts/list-runs.mjs',
        runIndex: '.tpan-opt-co-worker/runs/index.json'
      },
      webConsole: {
        index: '.tpan-opt-co-worker/console/index.html',
        runs: '.tpan-opt-co-worker/console/runs.json',
        runsScript: '.tpan-opt-co-worker/console/runs.js'
      }
    },
    verification: {
      command: 'node scripts/verify-workflow.mjs',
      localRunDir: '.tpan-opt-co-worker/runs/local'
    }
  }

  return `${JSON.stringify(manifest, null, 2)}\n`
}
