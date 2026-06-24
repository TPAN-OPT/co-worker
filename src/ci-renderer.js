export function renderGithubAction(workflow) {
  return `name: TPAN-OPT/CO-WORKER Verify

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  verify:
    name: Verify ${workflow.name}
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: |
          if [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then
            npm ci
          elif [ -f package.json ]; then
            npm install
          else
            echo "No package.json found; skipping dependency install."
          fi

      - name: Run TPAN-OPT/CO-WORKER verification
        run: |
          node scripts/verify-workflow.mjs --run-dir .tpan-opt-co-worker/runs/ci

      - name: Upload TPAN-OPT/CO-WORKER evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: tpan-opt-co-worker-evidence
          path: .tpan-opt-co-worker/runs
`
}

export function renderGitlabCi() {
  return `stages:
  - verify

tpan_opt_verify:
  stage: verify
  image: node:22
  before_script:
    - |
      if [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then
        npm ci
      elif [ -f package.json ]; then
        npm install
      else
        echo "No package.json found; skipping dependency install."
      fi
  script:
    - node scripts/verify-workflow.mjs --run-dir .tpan-opt-co-worker/runs/gitlab
  artifacts:
    when: always
    name: tpan-opt-co-worker-evidence
    paths:
      - .tpan-opt-co-worker/runs
`
}
