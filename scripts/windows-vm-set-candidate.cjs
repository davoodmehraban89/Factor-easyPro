'use strict';
// The candidate is built only in the disposable CI workspace.
// Never commit or publish this version number as a production release.
const fs = require('node:fs');
const path = require('node:path');
const packagePath = path.resolve('package.json');
const tauriPath = path.resolve('src-tauri/tauri.conf.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
if (pkg.version !== tauri.version) throw Error('Package and Tauri versions disagree');
const found = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
if (!found) throw Error('Expected stable semantic version in package manifest');
const version = found[1] + '.' + found[2] + '.' + (Number(found[3]) + 1);
if (version === '2.0.3') throw Error('Candidate must differ from published 2.0.3');
pkg.version = version;
tauri.version = version;
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, 'version=' + version + '\n');
}
console.log('CI-only Windows NSIS test candidate:', version);
