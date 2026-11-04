// Check extracted static CSS against its approved source, without a browser.
// Conditional styles remain mounted in their original React positions through
// the Design System; literal colors expand back to the exact baseline values.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import postcss from 'postcss';
const project = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(project, 'src');
const assets = JSON.parse(fs.readFileSync(path.join(project, 'docs/component-style-assets.json'), 'utf8'));
const values = new Map();
postcss.parse(fs.readFileSync(path.join(source, 'design-system/tokens/defaults.css'), 'utf8')).walkDecls(decl => values.set(decl.prop, decl.value));
function baseline(file) {
  return process.env.BASELINE_DIRECTORY ? fs.readFileSync(path.join(process.env.BASELINE_DIRECTORY, 'src', file), 'utf8')
    : cp.execFileSync('git', ['show', `${process.env.BASELINE_REF ?? 'HEAD'}:voice-dashboard/src/${file}`], {cwd: project, encoding: 'utf8'});
}
function template(text, block) {
  const tree = ts.createSourceFile('fixture.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const constants = new Map(), styles = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isNoSubstitutionTemplateLiteral(node.initializer)) constants.set(node.name.text, node.initializer.text);
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'style') styles.push(node.children.find(ts.isJsxExpression)?.expression);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  const expression = styles[block];
  if (expression && ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (expression && ts.isIdentifier(expression) && constants.has(expression.text)) return constants.get(expression.text);
  throw Error('The baseline stylesheet is not static.');
}
function canonical(text) {
  const root = postcss.parse(text), rules = [], seen = new Set();
  root.walkRules(rule => rules.push(rule));
  for (const rule of rules.reverse()) for (const decl of [...rule.nodes].reverse()) {
    if (decl.type !== 'decl') continue;
    let context = '';
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) context += '@' + parent.name + ' ' + parent.params;
    const key = context + '|' + rule.selector + '|' + decl.prop;
    if (seen.has(key + '|' + !!decl.important) || (!decl.important && seen.has(key + '|true'))) decl.remove();
    else seen.add(key + '|' + !!decl.important);
  }
  const declarations = [];
  root.walkDecls(decl => {
    const context = [];
    for (let parent = decl.parent; parent && parent.type !== 'root'; parent = parent.parent) context.unshift(parent.type === 'rule' ? parent.selector : '@' + parent.name + ' ' + parent.params);
    declarations.push([context, decl.prop, decl.value, !!decl.important]);
  });
  return JSON.stringify(declarations);
}
const baselineValues = new Map();
postcss.parse(baseline('design-system/tokens/defaults.css')).walkDecls(decl => baselineValues.set(decl.prop, decl.value));
function expand(text, key, tokens) {
  return text.replace(/var\((--[\w-]+)\)/g, (match, prop) => prop.startsWith('--' + key + '-') && tokens.has(prop) ? tokens.get(prop) : match);
}
const results = [];
for (const asset of assets) {
  const baselineConsumer = baseline(asset.file);
  // A later baseline may already own the extracted asset. Compare that asset
  // rather than expecting an application <style> block to reappear.
  const baselineSheet = baselineConsumer.includes(`<ComponentStyles name="${asset.key}" />`)
    ? expand(baseline(asset.asset), asset.key, baselineValues)
    : template(baselineConsumer, asset.block);
  const before = canonical(baselineSheet);
  const current = fs.readFileSync(path.join(source, asset.asset), 'utf8');
  const expanded = expand(current, asset.key, values);
  if (canonical(expanded) !== before) throw Error('Stylesheet declarations changed: ' + asset.key);
  const consumer = fs.readFileSync(path.join(source, asset.file), 'utf8');
  if (!consumer.includes(`<ComponentStyles name="${asset.key}" />`)) throw Error('Missing mounted stylesheet consumer: ' + asset.key);
  results.push({key: asset.key, declarationEquivalence: true, mountedConsumer: true});
}
console.log(`${results.length} Design System style assets: declaration equivalence and mounted consumers verified.`);
if (process.env.STYLE_ASSET_REPORT_PATH) fs.writeFileSync(process.env.STYLE_ASSET_REPORT_PATH, JSON.stringify(results, null, 2) + '\n');
