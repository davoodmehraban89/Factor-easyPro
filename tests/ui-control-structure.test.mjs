import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'src', 'views');
const viewFiles = fs.readdirSync(folder).filter(n => n.endsWith('.js'));
const views = new Map(viewFiles.map(filename => [
  path.basename(filename, '.js'),
  fs.readFileSync(path.join(folder, filename), 'utf8')
]));

test('Q01: every named inline view handler has an actual declared view method', () => {
  const missing = [];
  const refs = [];
  for (const [sourceName, source] of views) {
    // Find only declarations in the HTML/template markup, not arbitrary test
    // or controller calls that do not become user-facing controls.
    const actions = [...source.matchAll(/on(?:click|change|input|submit|mousedown|blur|focus|keyup|keydown)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)];
    for (const action of actions) {
      const handler = (action[1] || action[2] || '').replace(/\\(["'])/g, '$1');
      for (const call of handler.matchAll(/(?:window\.)?([A-Za-z_$][\w$]*(?:View|Modal))\.([A-Za-z_$][\w$]*)\s*\(/g)) {
        const viewName = call[1], method = call[2];
        refs.push({sourceName, viewName, method});
        const src = views.get(viewName);
        if (!src) {
          missing.push({sourceName, viewName, method, reason:'source-not-found'});
          continue;
        }
        const declaration = new RegExp('^\\s*(?:async\\s+)?' + method + '\\s*\\(', 'm');
        if (!declaration.test(src)) missing.push({sourceName, viewName, method, reason:'method-not-declared'});
      }
    }
  }
  assert.ok(viewFiles.length >= 10, 'unexpectedly few view files in UI inventory');
  assert.ok(refs.length >= 80, 'inline view events not sufficiently inventoried');
  assert.deepEqual(missing, [], 'declared on* handlers must resolve to real view methods');
});

test('Q01: the actual sidebar has one entry for each registered route', () => {
  const shell = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const sidebar = [...shell.matchAll(/data-page="([a-z]+)"/g)].map(x=>x[1]);
  const registered = [...main.matchAll(/\{ name: '([a-z]+)',\s*title:/g)].map(x=>x[1]);
  assert.equal(new Set(sidebar).size, sidebar.length, 'sidebar has duplicated navigation controls');
  assert.equal(new Set(registered).size, registered.length, 'router has duplicate route definitions');
  assert.equal(sidebar.length, 10, 'navigation coverage baseline changed; update native click audit');
  assert.deepEqual(sidebar.sort(), registered.sort(), 'sidebar has missing, orphan or dead routes');
});

test('Q01: the native UI coverage runner must report unclicked controls explicitly', () => {
  const source = fs.readFileSync(path.join(root, 'tests', 'windows-vm-ui-interaction-audit-browser.js'), 'utf8');
  for (const required of [
    'routesVisited','safeClickCount','not-clicked',
    'financialActionsNotBulkClicked:true','everyActionVerified:false',
    'accessibilityNameGaps','missing-function'
  ]) {
    assert.ok(source.includes(required), 'coverage reporter missing mandatory field: '+required);
  }
  assert.ok(!source.includes('localStorage.clear()') && !source.includes('wipeAll('),
    'interaction audit must never clear the database in the installed VM');
});
