const MARKETPLACE_PACKAGES = [
  {
    id: 'skill:tdd-workflow',
    type: 'skill',
    name: 'TDD Workflow',
    description:
      'Reusable test-driven development workflow skill for feature work, bug fixes, and refactoring.',
    source: 'builtin',
    tags: ['testing', 'quality', 'workflow'],
    install: {
      target: '.agents/skills/tdd-workflow',
      files: ['SKILL.md', 'agents/openai.yaml']
    }
  },
  {
    id: 'skill:security-review',
    type: 'skill',
    name: 'Security Review',
    description:
      'Security review skill covering input validation, secret hygiene, dependency audit, and release blockers.',
    source: 'builtin',
    tags: ['security', 'review', 'policy'],
    install: {
      target: '.agents/skills/security-review',
      files: ['SKILL.md', 'agents/openai.yaml']
    }
  },
  {
    id: 'mcp:context7',
    type: 'mcp',
    name: 'Context7 Documentation Lookup',
    description:
      'MCP server profile for current library, SDK, framework, and cloud-service documentation lookup.',
    source: 'builtin',
    tags: ['docs', 'mcp', 'research'],
    install: {
      target: '.codex/config.toml',
      files: ['mcp-configs/context7.toml']
    }
  },
  {
    id: 'mcp:playwright',
    type: 'mcp',
    name: 'Playwright Browser Verification',
    description:
      'MCP server profile for browser automation, screenshots, and interactive web-console verification.',
    source: 'builtin',
    tags: ['e2e', 'browser', 'mcp'],
    install: {
      target: '.codex/config.toml',
      files: ['mcp-configs/playwright.toml']
    }
  },
  {
    id: 'hook:workflow-preflight',
    type: 'hook',
    name: 'Workflow Preflight Guard',
    description:
      'Portable hook package metadata for validating workflow gates, evidence paths, and protected actions before handoff.',
    source: 'builtin',
    tags: ['hooks', 'verification', 'governance'],
    install: {
      target: 'hooks/workflow-preflight',
      files: ['hook.json', 'README.md']
    }
  }
]

export function listMarketplacePackages() {
  return MARKETPLACE_PACKAGES.map((marketplacePackage) => ({
    ...marketplacePackage,
    tags: [...marketplacePackage.tags],
    install: {
      ...marketplacePackage.install,
      files: [...marketplacePackage.install.files]
    }
  }))
}
