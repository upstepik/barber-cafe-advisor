import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  BEARD_STATES,
  FACE_SHAPES,
  HAIRCUTS,
  PROFILE_ANGLES,
  angledAssetPath,
  DEFAULT_OUTPUT_ROOT,
} from './haircut-library-config.mjs';

const args = parseArgs(process.argv.slice(2));
const workspace = process.cwd();
const inputRoot = path.resolve(workspace, args.input || DEFAULT_OUTPUT_ROOT);
const outputRoot = path.resolve(workspace, args.output || 'public/assets/haircuts-by-haircut');
const dryRun = Boolean(args['dry-run']);

let copied = 0;

for (const haircut of HAIRCUTS) {
  for (const angle of PROFILE_ANGLES) {
    for (const faceShape of FACE_SHAPES) {
      for (const beardState of BEARD_STATES) {
        const input = path.resolve(workspace, angledAssetPath({
          root: inputRoot,
          faceShape: faceShape.id,
          beardState: beardState.id,
          angle,
          haircut: haircut.id,
        }));

        const output = path.resolve(outputRoot, haircut.id, angle, faceShape.id, `${beardState.id}.png`);

        if (dryRun) continue;

        await mkdir(path.dirname(output), { recursive: true });
        await copyFile(input, output);
        copied += 1;
      }
    }
  }
}

console.log(JSON.stringify({ copied, outputRoot: path.relative(workspace, outputRoot) }, null, 2));

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

