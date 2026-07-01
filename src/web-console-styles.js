// Static stylesheet for the generated web console. Extracted verbatim from
// web-console-renderer.js to keep that file under the repository line cap;
// interpolated back into the <style> block so console output is unchanged.
export const CONSOLE_STYLES = `    :root {
      color-scheme: light;
      --bg: #f6f8f7;
      --surface: #ffffff;
      --text: #17201c;
      --muted: #64716b;
      --line: #dce3df;
      --accent: #256f5b;
      --accent-soft: #e4f2ec;
      --command: #345f9f;
      --manual: #8f5a13;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 24px 32px;
      border-bottom: 1px solid var(--line);
      background: var(--surface);
    }
    main {
      width: min(1180px, calc(100% - 32px));
      margin: 24px auto 40px;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 24px; line-height: 1.2; letter-spacing: 0; }
    h2 { font-size: 16px; margin-bottom: 12px; letter-spacing: 0; }
    h3 { font-size: 14px; letter-spacing: 0; }
    .mark {
      width: 44px;
      height: 44px;
      flex: 0 0 auto;
    }
    .muted { color: var(--muted); }
    .overview {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .metric, .panel, .stage, .run {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .metric { padding: 16px; }
    .metric strong { display: block; font-size: 22px; line-height: 1.1; }
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.4fr);
      gap: 16px;
      align-items: start;
    }
    .panel { padding: 18px; }
    .role {
      display: grid;
      grid-template-columns: 150px minmax(0, 1fr);
      gap: 12px;
      padding: 12px 0;
      border-top: 1px solid var(--line);
    }
    .role:first-of-type { border-top: 0; padding-top: 0; }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 2px 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      background: #fbfcfb;
      white-space: nowrap;
    }
    .stage {
      padding: 16px;
      margin-bottom: 12px;
    }
    .stage-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 12px;
    }
    .owner {
      color: var(--accent);
      background: var(--accent-soft);
      border-radius: 999px;
      padding: 2px 8px;
      white-space: nowrap;
    }
    .gate {
      display: grid;
      grid-template-columns: 100px minmax(0, 1fr);
      gap: 10px;
      padding: 10px 0;
      border-top: 1px solid var(--line);
    }
    .badge {
      width: max-content;
      min-width: 76px;
      text-align: center;
      border-radius: 999px;
      padding: 2px 8px;
      color: #ffffff;
      font-size: 12px;
      line-height: 20px;
    }
    .badge.manual { background: var(--manual); }
    .badge.command { background: var(--command); }
    .console-note {
      margin-top: 16px;
      color: var(--muted);
    }
    .organization-panel, .designer-panel, .catalog-panel, .summary-panel, .run-panel, .detail-panel, .orchestration-panel {
      margin-top: 16px;
    }
    .orchestration-head { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
    .section-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 12px;
    }
    .section-head h2 { margin-bottom: 0; }
    .designer-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .action {
      min-height: 32px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 5px 10px;
      background: #fbfcfb;
      color: var(--text);
      font: inherit;
      text-decoration: none;
      cursor: pointer;
    }
    .action:hover {
      border-color: var(--accent);
      color: var(--accent);
    }
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .filter-button {
      min-height: 30px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 10px;
      background: #fbfcfb;
      color: var(--muted);
      font: inherit;
      cursor: pointer;
    }
    .filter-button.active-filter {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent);
    }
    .schema-line {
      margin-bottom: 10px;
    }
    .designer-status {
      margin-top: 10px;
    }
    .designer-status.valid { color: var(--accent); }
    .designer-status.invalid { color: #a33b32; }
    .designer-status ul {
      margin: 6px 0 0;
      padding-left: 18px;
    }
    #workflow-json {
      display: block;
      width: 100%;
      min-height: 300px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
      background: #fbfcfb;
      color: var(--text);
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      overflow: auto;
    }
    .run-summary {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
    }
    .summary-item {
      min-width: 0;
      padding-left: 12px;
      border-left: 3px solid var(--line);
    }
    .summary-item strong {
      display: block;
      font-size: 20px;
      line-height: 1.15;
    }
    .summary-item.passed { border-left-color: #256f5b; }
    .summary-item.pending { border-left-color: #8f5a13; }
    .summary-item.failed { border-left-color: #a33b32; }
    .run {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 120px 180px;
      gap: 12px;
      align-items: center;
      padding: 12px;
      margin-top: 8px;
    }
    .run-artifacts {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
    }
    .artifact-link {
      color: var(--accent);
      font-size: 12px;
      text-decoration: none;
    }
    .artifact-link:hover {
      text-decoration: underline;
    }
    .status {
      width: max-content;
      border-radius: 999px;
      padding: 2px 8px;
      color: #ffffff;
      font-size: 12px;
      line-height: 20px;
    }
    .status.passed { background: #256f5b; }
    .status.pending { background: #8f5a13; }
    .status.failed { background: #a33b32; }
    .run-module {
      display: inline-block;
      border-radius: 999px;
      padding: 1px 8px;
      margin-right: 6px;
      background: #2b3a55;
      color: #cdd9f0;
      font-size: 12px;
    }
    .detail {
      border-top: 1px solid var(--line);
      padding: 12px 0;
    }
    .detail:first-of-type { border-top: 0; padding-top: 0; }
    .gate-result {
      display: grid;
      grid-template-columns: 120px minmax(0, 1fr) 90px;
      gap: 10px;
      align-items: start;
      padding: 8px 0;
    }
    .gate-meta {
      margin-top: 6px;
      color: var(--muted);
      font-size: 12px;
    }
    .gate-meta div {
      overflow-wrap: anywhere;
    }
    .catalog-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .catalog-column {
      min-width: 0;
      border-top: 1px solid var(--line);
      padding-top: 12px;
    }
    .catalog-item {
      margin-top: 10px;
      overflow-wrap: anywhere;
    }
    .evidence-links {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }
    .evidence-link {
      color: var(--accent);
      text-decoration: none;
    }
    .evidence-link:hover {
      text-decoration: underline;
    }
    @media (max-width: 820px) {
      header { padding: 18px 16px; }
      .overview, .grid, .catalog-grid, .run-summary { grid-template-columns: 1fr; }
      .section-head { align-items: flex-start; flex-direction: column; }
      .role, .gate, .run, .gate-result { grid-template-columns: 1fr; }
    }`
