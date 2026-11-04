// Compare registry values with executable expressions from the approved baseline.
// This checks input parity; it does not claim WebGL pixel parity.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('../', import.meta.url));
const baselineRef = process.env.BASELINE_REF ?? '1308b46';
const baseline = file => cp.execFileSync('git', ['show', `${baselineRef}:voice-dashboard/${file}`], { cwd: project, encoding: 'utf8' });
const cache = new Map();
function load(file) {
  file = path.resolve(project, file);
  if (cache.has(file)) return cache.get(file);
  const text = fs.readFileSync(file, 'utf8').replace("import.meta.glob('./themes/*.css', { eager: true });", '');
  const code = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; cache.set(file, exports);
  vm.runInNewContext(code, { exports, require: specifier => load(path.resolve(path.dirname(file), specifier + '.ts')) }, { filename: file });
  return exports;
}
const { CORE_THEMES: REGISTERED_THEMES } = load('src/theme/themes.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const baselineExports = {};
vm.runInNewContext(ts.transpileModule(baseline('src/theme/themes.ts').replace("import.meta.glob('./themes/*.css', { eager: true });", ''), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: baselineExports });
// Compare approved themes with their own baseline. New registry entries have no
// historical values and are covered by type checks and extension/runtime smoke.
const CORE_THEMES = Object.fromEntries(Object.entries(REGISTERED_THEMES).filter(([id]) => Object.hasOwn(baselineExports.CORE_THEMES, id)));
assert.equal(Object.keys(CORE_THEMES).length, Object.keys(baselineExports.CORE_THEMES).length, 'An approved theme was removed');
for (const [id, theme] of Object.entries(CORE_THEMES)) {
  const original = baselineExports.CORE_THEMES[id];
  assert.ok(original, 'Unexpected theme in final registry: ' + id);
  for (const [role, value] of Object.entries(original.three)) assert.deepEqual(plain(theme.three[role]), plain(value), id + '/three/' + role);
  for (const role of ['appearance', 'performance', 'environment', 'surfaceFamily']) assert.equal(theme[role], original[role], id + '/' + role);
  if (theme.performance === 'static') for (const effect of ['spaceBackdrop', 'neuralCore', 'solarAtmosphere', 'curtainAtmosphere', 'stellarCore', 'nexusOrb']) assert.equal(theme.login[effect], false, id + '/static/' + effect);
}

function environment(id) {
  return {
    isAurora: id === 'aurora', isSolaris: id === 'solaris', isObsidian: id === 'obsidian', isQuartz: id === 'quartz',
    isJecHorizon: id === 'jec-horizon', isJecSkywave: id === 'jec-skywave', isJecTheme: id.startsWith('jec-'),
    isStaticTheme: ['obsidian', 'quartz', 'jec-horizon'].includes(id), isLight: !['cosmic-black', 'aurora', 'obsidian'].includes(id),
  };
}
const trees = new Map();
function source(file) {
  if (trees.has(file)) return trees.get(file);
  const text = baseline(file), tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), constants = {};
  for (const statement of tree.statements) if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
    try { constants[declaration.name.text] = vm.runInNewContext('(' + declaration.initializer.getText(tree) + ')'); } catch { /* Non-constant application logic is not evaluated. */ }
  }
  const result = { text, tree, constants }; trees.set(file, result); return result;
}
let comparisons = 0;
for (const manifest of ['theme-renderer-value-migration.json', 'theme-exsum-value-migration.json', 'theme-login-value-migration.json']) {
  for (const entry of JSON.parse(fs.readFileSync(path.join(project, 'docs', manifest), 'utf8'))) {
    const { tree, constants, text } = source(entry.file);
    let expression = entry.expression;
    if (!expression) {
      function visit(node) {
        if (ts.isConditionalExpression(node) && tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1 === entry.line && node.condition.getText(tree) === 'isSolaris') {
          const light = vm.runInNewContext('(' + node.whenTrue.getText(tree) + ')');
          const dark = vm.runInNewContext('(' + node.whenFalse.getText(tree) + ')');
          if (JSON.stringify(light) === JSON.stringify(entry.light) && JSON.stringify(dark) === JSON.stringify(entry.dark)) expression = node.getText(tree);
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
    assert.ok(expression, `Missing baseline expression: ${entry.file}:${entry.role}`);
    const normalize = value => value.replace(/\s+/g, '');
    assert.ok(normalize(text).includes(normalize(expression)), `Expression not in baseline: ${expression}`);
    const renderer = path.basename(entry.file, '.tsx');
    assert.ok(fs.readFileSync(path.join(project, entry.file), 'utf8').includes((renderer === 'LoginPortal' ? 'login.' : 'visual.') + entry.role), 'Missing configuration consumer: ' + entry.role);
    for (const [id, theme] of Object.entries(CORE_THEMES)) {
      let expected = vm.runInNewContext('(' + expression + ')', { ...constants, ...environment(id) });
      // Approved display-name change; internal theme IDs remain compatible.
      if (id === 'jec-skywave' && renderer === 'LoginPortal' && entry.role === 'gatewayTitle') expected = 'SKYWAVE GATEWAY';
      const actual = renderer === 'LoginPortal' ? theme.login[entry.role] : theme.three.renderers[renderer][entry.role];
      assert.deepEqual(plain(actual), plain(expected), `${id}/${renderer}/${entry.role}`); comparisons++;
    }
  }
}
// Demography preserves base palette inheritance; clinical fullscreen keeps dark materials.
for (const [id, theme] of Object.entries(CORE_THEMES)) {
  const { text } = source('src/components/DemographyChart.tsx');
  const original = /const sceneTheme = ([\s\S]*?);\n\n  const donutMode/.exec(text)?.[1];
  const expected = vm.runInNewContext('(' + original + ')', { ...environment(id), theme: { three: Object.fromEntries(Object.entries(theme.three).filter(([key]) => key !== 'renderers')) } });
  const actual = { ...theme.three, ...theme.three.renderers.DemographyChart.scene }; delete actual.renderers;
  assert.deepEqual(plain(actual), plain(expected), id + '/demographyScene');
  for (const renderer of ['DemographyChart', 'IOLUsage']) assert.equal(theme.three.renderers[renderer].lightMaterials, environment(id).isLight && !environment(id).isJecTheme);
  for (const renderer of ['PanelExsumMaterial', 'PanelExsumDoctorFee']) assert.equal(theme.three.renderers[renderer].surfaceBlend, id === 'aurora' || id === 'solaris' ? 1 : 0);
}
// Shader programs and animation callbacks remain byte-for-byte equivalent apart
// from the value parameter and local configuration access used by callbacks.
let shaders = 0;
for (const file of ['src/LoginPortal.tsx', ...Object.keys(CORE_THEMES['cosmic-black'].three.renderers).map(name => `src/components/${name}.tsx`)]) {
  function shaderSources(text) {
    const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), values = [];
    function visit(node) { if (ts.isNoSubstitutionTemplateLiteral(node) && /void\s+main\s*\(/.test(node.text)) values.push(node.text); ts.forEachChild(node, visit); }
    visit(tree); return values;
  }
  const before = shaderSources(baseline(file)), after = shaderSources(fs.readFileSync(path.join(project, file), 'utf8'));
  assert.deepEqual(after, before, 'Shader code changed: ' + file); shaders += before.length;
}
// Normalize only theme-dependent expressions inside animation callbacks. All
// geometry, timing, interpolation and interaction math must remain equivalent.
let animationCallbacks = 0;
for (const file of ['src/LoginPortal.tsx', ...Object.keys(CORE_THEMES['cosmic-black'].three.renderers).map(name => `src/components/${name}.tsx`)]) {
  const renderer = path.basename(file, '.tsx');
  for (const [id, theme] of Object.entries(CORE_THEMES)) {
    function callbacks(text) {
      const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), result = [];
      const context = { ...environment(id), visual: theme.three.renderers[renderer], login: theme.login };
      function literal(value) {
        return ts.createSourceFile('value.ts', '(' + JSON.stringify(value) + ')', ts.ScriptTarget.Latest, true).statements[0].expression;
      }
      const transformer = transformation => {
        function visit(node) {
          if ((ts.isConditionalExpression(node) && /\bis(?:Aurora|Solaris)\b/.test(node.condition.getText(tree))) ||
              (ts.isPropertyAccessExpression(node) && /^(?:visual|login)\./.test(node.getText(tree)))) {
            try {
              const value = vm.runInNewContext('(' + node.getText(tree) + ')', context);
              if (value !== undefined) return literal(value);
            } catch { /* Preserve expressions depending on live chart data. */ }
          }
          return ts.visitEachChild(node, visit, transformation);
        }
        return root => ts.visitNode(root, visit);
      };
      function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useFrame') {
          const transformed = ts.transform(node.arguments[0], [transformer]);
          result.push(ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Unspecified, transformed.transformed[0], tree).replace(/\s+/g, ''));
          transformed.dispose();
        }
        ts.forEachChild(node, visit);
      }
      visit(tree); return result;
    }
    assert.deepEqual(callbacks(fs.readFileSync(path.join(project, file), 'utf8')), callbacks(baseline(file)), `${id}/${renderer}/animation`);
    if (id === 'cosmic-black') animationCallbacks += callbacks(baseline(file)).length;
  }
}
const report = { baselineRef, themes: Object.keys(CORE_THEMES).length, registeredThemes: Object.keys(REGISTERED_THEMES).length, valueComparisons: comparisons, shaderProgramsUnchanged: shaders, animationCallbacksUnchanged: animationCallbacks, demographyInheritance: true, clinicalDarkStage: true, numericShaderBlend: true, basePaletteUnchanged: true, staticPerformancePreserved: true, webglPixelComparison: false };
console.log(JSON.stringify(report, null, 2));
if (process.env.RENDERER_REPORT_PATH) fs.writeFileSync(process.env.RENDERER_REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
