import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  ASYMMETRIC_PROFILE_HAIRCUTS,
  BEARD_STATES,
  canonicalAssetPath,
  DEFAULT_CELL_SIZE,
  DEFAULT_LEFT_PROFILE_SHEET_ROOT,
  DEFAULT_PROFILE_REFERENCE_ROOT,
  DEFAULT_RIGHT_PROFILE_ASYM_SHEET_ROOT,
  FACE_SHAPES,
  HAIRCUTS,
  profileContactSheetPath,
  profileContactSheetPrompt,
  profileReferenceSheetPath,
} from './haircut-library-config.mjs';

const workspace = process.cwd();
const manifestPath = path.resolve(workspace, 'scripts', 'profile-contact-sheet-manifest.json');
const referenceRoot = path.resolve(workspace, DEFAULT_PROFILE_REFERENCE_ROOT);

await mkdir(referenceRoot, { recursive: true });
await mkdir(path.resolve(workspace, DEFAULT_LEFT_PROFILE_SHEET_ROOT), { recursive: true });
await mkdir(path.resolve(workspace, DEFAULT_RIGHT_PROFILE_ASYM_SHEET_ROOT), { recursive: true });

const jobs = [];

for (const faceShape of FACE_SHAPES) {
  for (const beardState of BEARD_STATES) {
    const referenceSheet = await createReferenceSheet({
      faceShape: faceShape.id,
      beardState: beardState.id,
    });

    jobs.push({
      kind: 'left-profile',
      faceShape: faceShape.id,
      beardState: beardState.id,
      referenceSheet,
      sheet: profileContactSheetPath({
        root: DEFAULT_LEFT_PROFILE_SHEET_ROOT,
        faceShape: faceShape.id,
        beardState: beardState.id,
      }).replaceAll(path.sep, '/'),
      outputs: HAIRCUTS.map((haircut) =>
        path
          .join('public', 'assets', 'haircuts', faceShape.id, beardState.id, 'left-profile', `${haircut.id}.png`)
          .replaceAll(path.sep, '/'),
      ),
      prompt: profileContactSheetPrompt({
        faceShape: faceShape.id,
        beardState: beardState.id,
        angle: 'left-profile',
      }),
    });

    jobs.push({
      kind: 'right-profile-asym',
      faceShape: faceShape.id,
      beardState: beardState.id,
      referenceSheet,
      sheet: profileContactSheetPath({
        root: DEFAULT_RIGHT_PROFILE_ASYM_SHEET_ROOT,
        faceShape: faceShape.id,
        beardState: beardState.id,
      }).replaceAll(path.sep, '/'),
      outputs: ASYMMETRIC_PROFILE_HAIRCUTS.map((haircut) =>
        path
          .join('public', 'assets', 'haircuts', faceShape.id, beardState.id, 'right-profile', `${haircut}.png`)
          .replaceAll(path.sep, '/'),
      ),
      prompt: profileContactSheetPrompt({
        faceShape: faceShape.id,
        beardState: beardState.id,
        angle: 'right-profile',
      }),
    });
  }
}

await mkdir(path.dirname(manifestPath), { recursive: true });
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      referenceRoot: DEFAULT_PROFILE_REFERENCE_ROOT.replaceAll(path.sep, '/'),
      leftProfileSheetRoot: DEFAULT_LEFT_PROFILE_SHEET_ROOT.replaceAll(path.sep, '/'),
      rightProfileAsymSheetRoot: DEFAULT_RIGHT_PROFILE_ASYM_SHEET_ROOT.replaceAll(path.sep, '/'),
      grid: { columns: 4, rows: 3 },
      order: HAIRCUTS.map((haircut) => haircut.id),
      asymmetricRightProfileHaircuts: ASYMMETRIC_PROFILE_HAIRCUTS,
      totalJobs: jobs.length,
      jobs,
    },
    null,
    2,
  )}\n`,
);

console.log(`Created ${path.relative(workspace, manifestPath)} with ${jobs.length} profile contact-sheet jobs.`);

async function createReferenceSheet({ faceShape, beardState }) {
  const outputPath = path.resolve(workspace, profileReferenceSheetPath({ faceShape, beardState }));
  const cell = DEFAULT_CELL_SIZE;
  const columns = 4;
  const rows = 3;
  const composite = [];

  for (const [index, haircut] of HAIRCUTS.entries()) {
    const input = path.resolve(workspace, canonicalAssetPath({ faceShape, beardState, haircut: haircut.id }));
    const buffer = await sharp(input).resize(cell, cell, { fit: 'cover', position: 'center' }).png().toBuffer();
    composite.push({
      input: buffer,
      left: (index % columns) * cell,
      top: Math.floor(index / columns) * cell,
    });
  }

  await sharp({
    create: {
      width: columns * cell,
      height: rows * cell,
      channels: 4,
      background: '#f7f0e4',
    },
  })
    .composite(composite)
    .png()
    .toFile(outputPath);

  return path.relative(workspace, outputPath).replaceAll(path.sep, '/');
}
