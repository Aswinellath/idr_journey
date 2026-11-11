// Turns test-results/results.json into a readable table: pass/fail per browser and screen,
// plus the first line of each failure. Printed to the log and to the GitHub run summary.
import fs from 'node:fs';

const file = 'test-results/results.json';
if (!fs.existsSync(file)) {
  console.log('No results file found.');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const strip = (s = '') => s.replace(/\u001b\[[0-9;]*m/g, '');
const rows = {};
const failures = [];
const retries = new Set();

function walk(suite) {
  for (const s of suite.suites || []) walk(s);
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      const p = t.projectName || 'default';
      rows[p] ??= { passed: 0, failed: 0, flaky: 0, skipped: 0 };
      for (const a of [...(t.annotations || []), ...((t.results || []).at(-1)?.annotations || [])]) {
        if (a.type === 'needed extra clicks') retries.add(`| ${p} | ${a.description.replace(/\|/g, '\\|')} |`);
      }
      if (t.status === 'expected') rows[p].passed++;
      else if (t.status === 'flaky') rows[p].flaky++;
      else if (t.status === 'skipped') rows[p].skipped++;
      else {
        rows[p].failed++;
        const last = (t.results || []).at(-1) || {};
        const err = strip(last.errors?.[0]?.message || last.error?.message || 'failed');
        failures.push(`| ${p} | ${spec.title} | ${err.split('\n').slice(0, 4).join('<br>').replace(/\|/g, '\\|')} |`);
      }
    }
  }
}
(data.suites || []).forEach(walk);

const order = ['desktop', 'tablet', 'mobile'];
const projects = Object.keys(rows).sort(
  (a, b) => order.indexOf(a.split('-')[1]) - order.indexOf(b.split('-')[1]) || a.localeCompare(b),
);

let md = '## Menu & links check\n\n| Browser / screen | Passed | Failed | Flaky | Skipped |\n| --- | --- | --- | --- | --- |\n';
for (const p of projects) {
  const r = rows[p];
  md += `| ${r.failed ? '❌' : '✅'} ${p} | ${r.passed} | ${r.failed} | ${r.flaky} | ${r.skipped} |\n`;
}
md += failures.length
  ? `\n### Failures\n\n| Browser / screen | Test | Error |\n| --- | --- | --- |\n${failures.join('\n')}\n`
  : '\nAll menu checks passed. ✅\n';

if (retries.size) {
  md += `\n### Worked only after re-clicking\n\nThese passed, but needed a second or third click/tap — a sign the menu is slow or partly covered.\n\n| Browser / screen | Item |\n| --- | --- |\n${[...retries].join('\n')}\n`;
}

console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
