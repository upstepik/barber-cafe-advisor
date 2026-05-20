import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { BEARD_STATES, canonicalAssetPath, DEFAULT_OUTPUT_ROOT, FACE_SHAPES, HAIRCUTS } from './haircut-library-config.mjs';

const workspace = process.cwd();
const outputRoot = path.resolve(workspace, DEFAULT_OUTPUT_ROOT);
const expectedPaths = new Set();
const missing = [];
const extras = [];

for (const faceShape of FACE_SHAPES) {
  for (const beardState of BEARD_STATES) {
    for (const haircut of HAIRCUTS) {
      const filePath = path.resolve(workspace, canonicalAssetPath({
        faceShape: faceShape.id,
        beardState: beardState.id,
        haircut: haircut.id,
      }));
      const relativePath = path.relative(outputRoot, filePath);
      expectedPaths.add(relativePath);

      try {
        await access(filePath);
      } catch {
        missing.push(relativePath);
      }
    }
  }
}

async function listPngs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listPngs(fullPath);
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.png') return [fullPath];
    return [];
  }));
  return files.flat();
}

for (const filePath of await listPngs(outputRoot)) {
  const relativePath = path.relative(outputRoot, filePath);
  if (!expectedPaths.has(relativePath)) extras.push(relativePath);
}

const report = {
  expected: FACE_SHAPES.length * BEARD_STATES.length * HAIRCUTS.length,
  missingCount: missing.length,
  extraCount: extras.length,
  missing,
  extras,
};

console.log(JSON.stringify(report, null, 2));

if (missing.length > 0) {
  process.exitCode = 1;
}
