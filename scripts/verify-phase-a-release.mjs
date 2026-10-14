import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const required = ['A01','A02','A03','A04','A05','A06','A07','A08',
  'INDEPENDENT_QA','DATA_BACKUP'];

export function verifyPhaseARelease({ acceptance, packageVersion, desktopVersion, tag }) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag) ||
      tag !== 'v' + packageVersion || packageVersion !== desktopVersion) {
    throw new Error('Public release version/tag/package/installer mismatch');
  }
  if (!acceptance || acceptance.schemaVersion !== 1 || acceptance.phase !== 'A' ||
      !Array.isArray(acceptance.requirements)) {
    throw new Error('Missing phase-A release acceptance manifest');
  }
  const byId = new Map();
  for (const row of acceptance.requirements) {
    if (!row || typeof row.id !== 'string' || byId.has(row.id)) {
      throw new Error('Duplicated or malformed release acceptance entry');
    }
    byId.set(row.id, row);
  }
  const blocked = [];
  for (const id of required) {
    const row = byId.get(id);
    if (row?.accepted !== true ||
        !Array.isArray(row.evidence) || !row.evidence.length ||
        row.evidence.some(link => typeof link !== 'string' ||
          !/^https:\/\/github\.com\/davoodmehraban89\/Factor-easyPro\/(?:actions\/runs|pull|issues)\/\d+/.test(link))) {
      blocked.push(id);
    }
  }
  if (blocked.length) {
    throw new Error('Public release blocked by unaccepted evidence-backed gates: ' + blocked.join(', '));
  }
  return { ready: true, tag, gates: required.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const json = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
    const acceptance = json('docs/PHASE_A_RELEASE_ACCEPTANCE.json');
    const notes = readFileSync(new URL('../docs/PHASE_A_RELEASE_NOTES_FA.md', import.meta.url), 'utf8');
    if (!notes.trim() || notes.includes('پیش‌نویس، منتشر نشود')) {
      throw new Error('Production release notes are still an unpublished draft');
    }
    const packageVersion = json('package.json').version;
    const desktopVersion = json('src-tauri/tauri.conf.json').version;
    const result = verifyPhaseARelease({
      acceptance, packageVersion, desktopVersion,
      tag: process.argv[2] || process.env.RELEASE_TAG || ''
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
