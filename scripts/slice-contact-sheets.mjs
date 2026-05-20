import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  BEARD_STATES,
  canonicalAssetPath,
  contactSheetPath,
  DEFAULT_CELL_SIZE,
  DEFAULT_CONTACT_SHEET_ROOT,
  DEFAULT_OUTPUT_ROOT,
  FACE_SHAPES,
  HAIRCUTS,
} from './haircut-library-config.mjs';

const args = parseArgs(process.argv.slice(2));
const workspace = process.cwd();
const inputRoot = path.resolve(workspace, args.input || DEFAULT_CONTACT_SHEET_ROOT);
const outputRoot = path.resolve(workspace, args.output || DEFAULT_OUTPUT_ROOT);
const margin = numberArg(args.margin, 0);
const gap = numberArg(args.gap, 0);
const size = numberArg(args.size, DEFAULT_CELL_SIZE);
const dryRun = Boolean(args['dry-run']);
const strict = Boolean(args.strict);

const selectedFaceShapes = args.face ? [args.face] : FACE_SHAPES.map((item) => item.id);
const selectedBeardStates = args.beard ? [args.beard] : BEARD_STATES.map((item) => item.id);
const report = { processedSheets: 0, writtenImages: 0, missingSheets: [], outputs: [] };

for (const faceShape of selectedFaceShapes) {
  for (const beardState of selectedBeardStates) {
    const sheetPath = args.sheet
      ? path.resolve(workspace, args.sheet)
      : path.resolve(workspace, contactSheetPath({ root: inputRoot, faceShape, beardState }));

    let metadata;
    try {
      metadata = await sharp(sheetPath).metadata();
    } catch {
      const relativeSheet = path.relative(workspace, sheetPath);
      report.missingSheets.push(relativeSheet);
      if (args.sheet) break;
      continue;
    }

    report.processedSheets += 1;
    const cells = buildCells({ width: metadata.width, height: metadata.height, margin, gap });

    for (const [index, haircut] of HAIRCUTS.entries()) {
      const outputPath = path.resolve(workspace, canonicalAssetPath({
        root: outputRoot,
        faceShape,
        beardState,
        haircut: haircut.id,
      }));
      const cell = cells[index];
      report.outputs.push(path.relative(workspace, outputPath));

      if (dryRun) continue;

      await mkdir(path.dirname(outputPath), { recursive: true });
      await sharp(sheetPath)
        .extract(cell)
        .resize(size, size, { fit: 'cover', position: 'center' })
        .png()
        .toFile(outputPath);
      report.writtenImages += 1;
    }

    if (args.sheet) break;
  }

  if (args.sheet) break;
}

console.log(JSON.stringify(report, null, 2));

if (strict && report.missingSheets.length > 0) {
  process.exitCode = 1;
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
