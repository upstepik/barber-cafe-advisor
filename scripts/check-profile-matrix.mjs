import { access } from 'node:fs/promises';
import path from 'node:path';
import {
  angledAssetPath,
  BEARD_STATES,
  DEFAULT_OUTPUT_ROOT,
  FACE_SHAPES,
  HAIRCUTS,
  PROFILE_ANGLES,
} from './haircut-library-config.mjs';

const workspace = process.cwd();
const outputRoot = path.resolve(workspace, DEFAULT_OUTPUT_ROOT);
const counts = Object.fromEntries(PROFILE_ANGLES.map((angle) => [angle, 0]));
const missing = [];

for (const faceShape of FACE_SHAPES) {
  for (const beardState of BEARD_STATES) {
    for (const angle of PROFILE_ANGLES) {
      for (const haircut of HAIRCUTS) {
        const filePath = path.resolve(workspace, angledAssetPath({
          faceShape: faceShape.id,
          beardState: beardState.id,
          angle,
          haircut: haircut.id,
        }));
        try {
          await access(filePath);
          counts[angle] += 1;
        } catch {
          missing.push(path.relative(outputRoot, filePath));
        }
      }
    }
  }
}

const report = {
  expected: FACE_SHAPES.length * BEARD_STATES.length * PROFILE_ANGLES.length * HAIRCUTS.length,
  counts,
  missingCount: missing.length,
  missing,
};

console.log(JSON.stringify(report, null, 2));

if (missing.length > 0) {
  process.exitCode = 1;
}
