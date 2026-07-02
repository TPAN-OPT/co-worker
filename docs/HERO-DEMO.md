# Hero Demo — a bad change gets caught at a gate

> The single most convincing thing co-worker does: **a substandard artifact cannot turn a gate green.**
> This is the demo to record (GIF/video) and the story to lead marketing with — show, don't tell.

Everything below is real and reproducible **offline** — no agent CLI, no network, no API spend. It uses the
orchestrator's own `--invoke` adapter to simulate a careless agent, then a real one.

Convention (same as the README): run `node src/cli.js …` from **this tool's directory**, and
`node scripts/…` from **inside the generated target repo**.

## The 60-second script

```bash
# 1. Scaffold a runnable delivery workflow — but don't run the team yet.
node src/cli.js quickstart --out ./hero-demo --no-demo --force
cd ./hero-demo

# 2. Simulate a CARELESS agent: it "does" every stage but writes a 4-char stub.
#    (In real life this is an agent that hallucinated, got cut off, or phoned it in.)
node scripts/orchestrate-workflow.mjs --run-id hero --invoke \
  --agent-command 'printf "todo" > .tpan-opt-co-worker/artifacts/{stage}.md'
```

**What happens:** the `clarify` stage's command gate checks its artifact, finds only 4 characters
(the gate requires substantive content), and **stays red**. The orchestrator **stops at the first
unsatisfied gate** and emits a work order. Nothing advanced. Nothing shipped.

```bash
# 3. See exactly where it stopped and why — this is the audit story.
node ../src/cli.js status --out .    # every stage's gate status at a glance
node ../src/cli.js next   --out .    # the open work order: fix clarify's artifact
```

```bash
# 4. Do the work properly. Hand it to a real agent (or write it yourself):
node scripts/orchestrate-workflow.mjs --run-id hero --invoke --loop \
  --agent-command 'claude -p "You are the {role}. Do stage {stage} from brief {brief}. Write your result to .tpan-opt-co-worker/artifacts/{stage}.md"'
```

**What happens now:** each stage produces a substantive artifact, every check gate goes **green**,
and the run **cascades** clarify → implement → review → ship, stopping at the one gate a machine
should never auto-pass: **human approval.**

```bash
# 5. Approve to ship — recorded as evidence, run advances to done.
node ../src/cli.js approve human_approval --stage ship --by you --run-id hero --out .
```

Open the console (`.tpan-opt-co-worker/console/index.html`) at any point to see the same story
visually: red gate → work order → green cascade → your approval.

Want to see the end state without running anything? Browse a [committed sample evidence trail](sample-evidence/) —
the same run's `state.json`, work order, artifact, and recorded human approval, on disk.

## The shot list (for a GIF/video)

1. **The setup (5s):** one `quickstart` command; terminal fills with compiled harness files.
2. **The bad change (10s):** the "careless agent" line runs; the run halts. Zoom the terminal:
   `clarify` gate **RED**, run stopped, work order emitted. Caption: *"A stub can't pass the gate."*
3. **The evidence (10s):** `status` / `next` — or the console — showing precisely where and why it
   stopped. Caption: *"Every gate, every artifact, auditable."*
4. **The fix (15s):** the real agent run; gates flip green one by one; the run cascades.
5. **The human gate (10s):** it stops at `human_approval`. Caption: *"Agents do the work. A human
   approves the gate that matters."*
6. **Ship (10s):** `approve`; run goes `done`; evidence recorded.

## Why this is the hero (not the feature list)

Every agent framework can *run* agents. The differentiating claim — the one that maps to the
[category we own](POSITIONING.md#the-category-we-compete-in-and-the-one-we-dont) — is that co-worker
makes agent output **trustworthy**: bad work is caught mechanically before it advances, and the whole
run leaves an audit trail. That is the pain teams feel the moment AI starts writing a lot of their
code, and it is what this 60 seconds proves.
