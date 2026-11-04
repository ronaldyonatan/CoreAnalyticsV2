import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const version = JSON.parse(fs.readFileSync(new URL('package.json', root))).version;
assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/, 'Application version must be a valid release version');
const notes = fs.readFileSync(new URL('src/release/release-notes.ts', root), 'utf8');
assert.equal(notes.match(/RELEASE_NOTES_VERSION\s*=\s*'([^']+)'/)?.[1], version, 'Release notes must be updated for the application version');
const lock = JSON.parse(fs.readFileSync(new URL('package-lock.json', root)));
assert.equal(lock.version, version, 'package-lock version differs');
assert.equal(lock.packages[''].version, version, 'package-lock root version differs');
const compose = new URL('../docker-compose.prod.yml', root);
// The Docker build context contains only voice-dashboard, so the compose file
// is checked locally/CI; APP_VERSION optionally checks the image tag in Docker.
if (fs.existsSync(compose)) {
  const text = fs.readFileSync(compose, 'utf8');
  const tag = text.match(/image:\s*\S*\/voice-dashboard:([^\s]+)/)?.[1];
  assert.equal(tag?.replace(/^v/i, ''), version, 'Deployment dashboard image tag differs from application version');
}
if (process.argv[2]) assert.equal(process.argv[2].replace(/^v/i, ''), version, 'Docker APP_VERSION differs from application version');
console.log(`Release V${version}: package, lockfile and available image tag checks passed.`);
