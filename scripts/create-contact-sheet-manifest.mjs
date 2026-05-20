import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BEARD_STATES,
  canonicalAssetPath,
  contactSheetPath,
  contactSheetPrompt,
  DEFAULT_CONTACT_SHEET_ROOT,
  DEFAULT_OUTPUT_ROOT,
  FACE_SHAPES,
  HAIRCUTS,
} from './haircut-library-config.mjs';

const workspace = process.cwd();
const manifestPath = path.resolve(workspace, 'scripts', 'contact-sheet-front-manifest.json');

const jobs = FACE_SHAPES.flatMap((faceShape) =>
  BEARD_STATES.map((beardState) => ({
    faceShape: faceShape.id,
    beardState: beardState.id,
    sheet: contactSheetPath({ faceShape: faceShape.id, beardState: beardState.id }).replaceAll(path.sep, '/'),
    outputs: HAIRCUTS.map((haircut) =>
      canonicalAssetPath({
        faceShape: faceShape.id,
        beardState: beardState.id,
        haircut: haircut.id,
      }).replaceAll(path.sep, '/'),
    ),
    prompt: contactSheetPrompt({ faceShape: faceShape.id, beardState: beardState.id }),
  })),
);

await mkdir(path.dirname(manifestPath), { recursive: true });
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      contactSheetRoot: DEFAULT_CONTACT_SHEET_ROOT.replaceAll(path.sep, '/'),
      outputRoot: DEFAULT_OUTPUT_ROOT.replaceAll(path.sep, '/'),
      grid: { columns: 4, rows: 3 },
      order: HAIRCUTS.map((haircut) => haircut.id),
      totalSheets: jobs.length,
      totalOutputs: jobs.length * HAIRCUTS.length,
      jobs,
    },
    null,
    2,
  )}\n`,
);

console.log(`Created ${path.relative(workspace, manifestPath)} with ${jobs.length} contact-sheet jobs.`);
