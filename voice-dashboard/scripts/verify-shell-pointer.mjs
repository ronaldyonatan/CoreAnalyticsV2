// Interaction contract check: utility hover is gated on touch pointers, while
// the original custom Solaris/Quartz row hover remains enabled. No microphone.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const project = fileURLToPath(new URL('../', import.meta.url));
const capture = process.env.SHELL_POINTER_CAPTURE_PATH ?? path.join(os.tmpdir(), `coreanalytics-shell-touch-${process.env.THEME_VIEWPORT_WIDTH ?? 390}.json`);
cp.execFileSync(process.execPath, [path.join(project, 'scripts/verify-shell-runtime.mjs'), '--capture'], {
  cwd: project,
  env: { ...process.env, SHELL_EXTENDED_STATES: '1', SHELL_TOUCH: '1', SHELL_BASELINE_PATH: capture, THEME_VIEWPORT_WIDTH: process.env.THEME_VIEWPORT_WIDTH ?? '390' },
  encoding: 'utf8', stdio: 'pipe',
});
const snapshots = JSON.parse(fs.readFileSync(capture, 'utf8'));
function differences(before, after) {
  assert.equal(after.length, before.length, 'Hover must not insert or remove shell nodes');
  const output = [];
  for (let node = 0; node < before.length; node++) {
    for (let pseudo = 0; pseudo < 3; pseudo++) {
      for (const property of new Set([...Object.keys(before[node].styles[pseudo]), ...Object.keys(after[node].styles[pseudo])])) {
        if (before[node].styles[pseudo][property] !== after[node].styles[pseudo][property]) output.push({ node, pseudo, property });
      }
    }
  }
  return output;
}
const report = {};
for (const [theme, states] of Object.entries(snapshots)) {
  let invariants = 0;
  for (const [hover, normal] of [
    ['activeChildHover', 'pinnedExpanded'], ['accountSidebarHover', 'pinnedExpanded'],
    ['pinActiveHover', 'pinnedExpanded'], ['voiceOffHover', 'pinnedExpanded'],
    ['logoutHover', 'pinnedExpanded'], ['voiceOnHover', 'voiceOn'],
    ['pinIdleHover', 'drawerExpanded'], ['drawerCloseHover', 'drawerExpanded'],
  ]) {
    assert.deepEqual(differences(states[normal], states[hover]), [], `${theme}: ${hover} must preserve the original no-hover-pointer appearance`);
    invariants++;
  }
  const customHover = theme === 'solaris' || theme === 'quartz';
  for (const hover of ['groupHover', 'idleChildHover']) {
    const diffs = differences(states.pinnedExpanded, states[hover]);
    if (customHover) assert.ok(diffs.length > 0, `${theme}: preserve the existing custom hover rules`);
    else assert.deepEqual(diffs, [], `${theme}: utility-only hover must remain gated on touch pointers`);
    for (let node = 0; node < states[hover].length; node++) {
      if (states[hover][node].hook?.split(/\s+/).includes('ds-menu-glyph')) {
        assert.equal(states[hover][node].styles[0].color, states.pinnedExpanded[node].styles[0].color, `${theme}: group-hover glyph utility must be gated on touch`);
      }
    }
    invariants++;
  }
  report[theme] = { hoverNone: true, pointerCoarse: true, viewport: Number(process.env.THEME_VIEWPORT_WIDTH ?? 390), invariants, passed: true };
  console.log(`${theme}: ${invariants} touch-pointer invariants passed`);
}
if (process.env.SHELL_POINTER_REPORT_PATH) fs.writeFileSync(process.env.SHELL_POINTER_REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
