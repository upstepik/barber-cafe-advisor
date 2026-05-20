import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  ASYMMETRIC_PROFILE_HAIRCUTS,
  angledAssetPath,
  BEARD_STATES,
  canonicalAssetPath,
  DEFAULT_CELL_SIZE,
  DEFAULT_LEFT_PROFILE_SHEET_ROOT,
  DEFAULT_OUTPUT_ROOT,
  DEFAULT_RIGHT_PROFILE_ASYM_SHEET_ROOT,
  FACE_SHAPES,
  HAIRCUTS,
  profileContactSheetPath,
  SYMMETRIC_PROFILE_HAIRCUTS,
} from './haircut-library-config.mjs';

const args = parseArgs(process.argv.slice(2));
const workspace = process.cwd();
const outputRoot = path.resolve(workspace, args.output || DEFAULT_OUTPUT_ROOT);
const leftRoot = path.resolve(workspace, args.left || DEFAULT_LEFT_PROFILE_SHEET_ROOT);
const rightAsymRoot = path.resolve(workspace, args.rightAsym || DEFAULT_RIGHT_PROFILE_ASYM_SHEET_ROOT);
const margin = numberArg(args.margin, 0);
const gap = numberArg(args.gap, 0);
const size = numberArg(args.size, DEFAULT_CELL_SIZE);
const dryRun = Boolean(args['dry-run']);
const strict = Boolean(args.strict);
const selectedFaceShapes = args.face ? [args.face] : FACE_SHAPES.map((item) => item.id);
const selectedBeardStates = args.beard ? [args.beard] : BEARD_STATES.map((item) => item.id);
const report = {
  copiedFronts: 0,
  slicedLeftProfiles: 0,
  mirroredRightProfiles: 0,
  slicedRightProfiles: 0,
  missingSheets: [],
};

for (const faceShape of selectedFaceShapes) {
  for (const beardState of selectedBeardStates) {
    await copyFrontAssets({ faceShape, beardState });
    await sliceLeftProfiles({ faceShape, beardState });
    await sliceRightAsymProfiles({ faceShape, beardState });
  }
}

console.log(JSON.stringify(report, null, 2));

if (strict && report.missingSheets.length > 0) {
  process.exitCode = 1;
}

async function copyFrontAssets({ faceShape, beardState }) {
  for (const haircut of HAIRCUTS) {
    const input = path.resolve(workspace, canonicalAssetPath({ faceShape, beardState, haircut: haircut.id }));
    const output = path.resolve(workspace, angledAssetPath({
      root: outputRoot,
      faceShape,
      beardState,
      angle: 'front',
      haircut: haircut.id,
    }));

    if (dryRun) continue;

    await mkdir(path.dirname(output), { recursive: true });
    await copyFile(input, output);
    report.copiedFronts += 1;
  }
}

async function sliceLeftProfiles({ faceShape, beardState }) {
  const sheetPath = path.resolve(workspace, profileContactSheetPath({
    root: leftRoot,
    faceShape,
    beardState,
  }));
  const metadata = await readSheetMetadata(sheetPath);
  if (!metadata) return;

  const cells = buildCells({ width: metadata.width, height: metadata.height, margin, gap });

  for (const [index, haircut] of HAIRCUTS.entries()) {
    const leftOutput = path.resolve(workspace, angledAssetPath({
      root: outputRoot,
      faceShape,
      beardState,
      angle: 'left-profile',
      haircut: haircut.id,
    }));

    const rightOutput = path.resolve(workspace, angledAssetPath({
      root: outputRoot,
      faceShape,
      beardState,
      angle: 'right-profile',
      haircut: haircut.id,
    }));

    if (dryRun) continue;

    await mkdir(path.dirname(leftOutput), { recursive: true });
    await sharp(sheetPath)
      .extract(cells[index])
      .resize(size, size, { fit: 'cover', position: 'center' })
      .png()
      .toFile(leftOutput);
    report.slicedLeftProfiles += 1;

    if (SYMMETRIC_PROFILE_HAIRCUTS.includes(haircut.id)) {
      await mkdir(path.dirname(rightOutput), { recursive: true });
      await sharp(leftOutput).flop().png().toFile(rightOutput);
      report.mirroredRightProfiles += 1;
    }
  }
}

async function sliceRightAsymProfiles({ faceShape, beardState }) {
  const sheetPath = path.resolve(workspace, profileContactSheetPath({
    root: rightAsymRoot,
    faceShape,
    beardState,
  }));
  const metadata = await readSheetMetadata(sheetPath);
  if (!metadata) return;

  const cells = buildCells({ width: metadata.width, height: metadata.height, margin, gap });

  for (const [index, haircut] of HAIRCUTS.entries()) {
    if (!ASYMMETRIC_PROFILE_HAIRCUTS.includes(haircut.id)) continue;

    const output = path.resolve(workspace, angledAssetPath({
      root: outputRoot,
      faceShape,
      beardState,
      angle: 'right-profile',
      haircut: haircut.id,
    }));

    if (dryRun) continue;

    await mkdir(path.dirname(output), { recursive: true });
    await sharp(sheetPath)
      .extract(cells[index])
      .resize(size, size, { fit: 'cover', position: 'center' })
      .png()
      .toFile(output);
    report.slicedRightProfiles += 1;
  }
}

async function readSheetMetadata(sheetPath) {
  try {
    return await sharp(sheetPath).metadata();
  } catch {
    report.missingSheets.push(path.relative(workspace, sheetPath));
    return null;
  }
}

function buildCells({ width, height, margin, gap }) {
  if (!width || !height) throw new Error('Contact sheet has no readable dimensions.');
  const columns = 4;
  const rows = 3;
  const cellWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
  const cellHeight = (height - margin * 2 - gap * (rows - 1)) / rows;

  if (cellWidth <= 0 || cellHeight <= 0) {
    throw new Error(`Invalid crop settings for ${width}x${height} sheet.`);
  }

  return Array.from({ length: rows * columns }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = Math.round(margin + column * (cellWidth + gap));
    const top = Math.round(margin + row * (cellHeight + gap));
    const right = Math.round(margin + (column + 1) * cellWidth + column * gap);
    const bottom = Math.round(margin + (row + 1) * cellHeight + row * gap);
    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  });
}

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

function numberArg(value, fallback) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`Invalid numeric value: ${value}`);
  return number;
}
