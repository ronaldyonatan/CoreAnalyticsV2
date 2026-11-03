// Inventory ownership violations without rewriting CSS or assuming classes are unused.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import postcss from 'postcss';

const project = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(project, 'src');
const findings = [];
function record(file, line, kind, detail) {
  findings.push({ file: path.relative(project, file), line, kind, detail });
}
function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(file) : [file];
  });
}
for (const file of filesIn(source)) {
  const relative = path.relative(source, file).split(path.sep).join('/');
  if (!/\.(css|tsx?|jsx?)$/.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.css')) {
    if (relative === 'index.css' && postcss.parse(text).nodes.some(node => node.type !== 'comment' && !(node.type === 'atrule' && node.name === 'import' && /^['"]tailwindcss['"]$/.test(node.params)))) record(file, 1, 'bootstrap-stylesheet-rule', 'Document and component rules belong to the Design System.');
    const themeDefinition = relative.startsWith('theme/themes/');
    const designSystem = relative.startsWith('design-system/');
    if (!themeDefinition && !designSystem && relative !== 'index.css') {
      record(file, 1, 'stylesheet-outside-owner', 'Move structure to Design System and visual values to theme definitions.');
    }
    const css = postcss.parse(text, { from: file });
    css.walkRules(rule => {
      if (!themeDefinition && /\[data-(?:active-)?theme\s*=/.test(rule.selector)) {
        record(file, rule.source.start.line, 'theme-specific-component-selector', rule.selector);
      }
    });
    if (themeDefinition) {
      css.walkDecls(decl => {
        if (!decl.prop.startsWith('--')) record(file, decl.source.start.line, 'component-property-in-theme', decl.prop);
      });
      css.walkRules(rule => {
        if (!rule.selectors.every(selector => /^(?:\[data-theme="[^"]+"\]|:where\(:root\))$/.test(selector))) {
          record(file, rule.source.start.line, 'component-selector-in-theme', rule.selector);
        }
      });
    }
    continue;
  }
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const line = node => tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const imported = node.moduleSpecifier.text;
      const resolved = path.resolve(path.dirname(file), imported.split('?')[0]);
      const designRoot = path.join(source, 'design-system');
      const ownedModule = relative.startsWith('design-system/');
      const ownedFile = resolved.startsWith(designRoot + path.sep);
      const vendor = !imported.startsWith('.') && !path.isAbsolute(imported);
      const ownedImport = ownedModule && (ownedFile || vendor);
      const designEntry = relative === 'theme/ThemeContext.tsx' && resolved === path.join(designRoot, 'index.css');
      if (/\.css(?:\?|$)/.test(imported) && !ownedImport && !designEntry && !(relative === 'main.tsx' && imported === './index.css')) {
        record(file, line(node), 'component-stylesheet-import', imported);
      }
    }
    if (!relative.startsWith('design-system/') && ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'style') {
      record(file, line(node), 'embedded-stylesheet', 'Application component owns a stylesheet.');
    }
    // Report each theme-specific flag once per file; the remaining references are
    // inspectable at the declaration, without flooding the report with every use.
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const flag of ['isAurora', 'isSolaris', 'isObsidian', 'isQuartz', 'isJecHorizon', 'isJecSkywave']) {
    const match = new RegExp(`\\b${flag}\\b`).exec(text);
    if (match) record(file, text.slice(0, match.index).split('\n').length, 'theme-identity-consumer', flag);
  }
}
const totals = {};
for (const finding of findings) totals[finding.kind] = (totals[finding.kind] ?? 0) + 1;
const cssFindings = findings.filter(finding => finding.kind !== 'theme-identity-consumer');
const report = { complete: findings.length === 0, cssOwnershipComplete: cssFindings.length === 0, cssFindings: cssFindings.length, totalFindings: findings.length, totals, findings };
if (process.argv.includes('--write')) fs.writeFileSync(path.join(project, 'docs/theme-ownership-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ complete: report.complete, cssOwnershipComplete: report.cssOwnershipComplete, cssFindings: report.cssFindings, totalFindings: report.totalFindings, totals }, null, 2));
console.log(process.argv.includes('--css-only') ? 'CSS ownership is checked separately; remaining theme identity consumers still prevent full architecture completion.' : 'Full completion requires zero findings; CSS ownership status is reported separately.');
if (process.argv.includes('--strict') && (process.argv.includes('--css-only') ? cssFindings.length : findings.length)) process.exitCode = 1;
