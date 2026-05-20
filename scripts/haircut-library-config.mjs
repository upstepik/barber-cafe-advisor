import path from 'node:path';

export const FACE_SHAPES = [
  {
    id: 'oval',
    prompt: 'oval face shape, balanced proportions',
    constraint: 'Keep the face visibly oval: balanced forehead, cheekbones, and jaw with natural proportions.',
  },
  {
    id: 'round',
    prompt: 'round face shape, fuller cheeks, softer jaw',
    constraint: 'Keep the face visibly round: fuller cheeks, softer jaw, and less vertical length than the oval or long variants.',
  },
  {
    id: 'square',
    prompt: 'square face shape, defined jaw, broader lower face',
    constraint: 'Keep the face visibly square: defined jaw, broader lower face, and strong but realistic barber-reference proportions.',
  },
  {
    id: 'long',
    prompt: 'long / oblong face shape, narrower cheeks, longer vertical proportions',
    constraint: 'Keep the face visibly long or oblong: narrower cheeks and longer vertical proportions without looking older.',
  },
];

export const BEARD_STATES = [
  {
    id: 'none',
    prompt: 'clean shaven, no beard, no mustache',
    constraint: 'The person must be clean shaven in every cell: no beard, no mustache, no visible stubble.',
  },
  {
    id: 'stubble',
    prompt: 'light stubble only, no full beard',
    constraint: 'Use light stubble only in every cell: subtle shadow, no full beard, no heavy mustache.',
  },
  {
    id: 'short_beard',
    prompt: 'short neat beard, tidy grooming',
    constraint: 'Use the same short neat beard in every cell: tidy grooming, controlled cheek and neck lines.',
  },
  {
    id: 'full_beard',
    prompt: 'full groomed beard, neat shape, not oversized, not very long',
    constraint: 'Use the same full groomed beard in every cell: neat shape, not oversized, not very long.',
  },
];

export const HAIRCUTS = [
  { id: 'low-taper', prompt: 'low taper' },
  { id: 'textured-crop', prompt: 'textured crop' },
  { id: 'french-crop', prompt: 'french crop' },
  { id: 'crew-cut', prompt: 'crew cut' },
  { id: 'buzz-fade', prompt: 'buzz fade' },
  { id: 'classic-scissor', prompt: 'classic scissor cut' },
  { id: 'modern-side-part', prompt: 'modern side part' },
  { id: 'ivy-league', prompt: 'ivy league' },
  { id: 'messy-fringe', prompt: 'messy fringe' },
  { id: 'short-quiff', prompt: 'short quiff' },
  { id: 'soft-flow', prompt: 'soft flow' },
  { id: 'curtains', prompt: 'curtains middle part' },
];

export const PROFILE_ANGLES = ['front', 'left-profile', 'right-profile'];
export const SYMMETRIC_PROFILE_HAIRCUTS = [
  'low-taper',
  'textured-crop',
  'french-crop',
  'crew-cut',
  'buzz-fade',
  'messy-fringe',
  'curtains',
];
export const ASYMMETRIC_PROFILE_HAIRCUTS = [
  'classic-scissor',
  'modern-side-part',
  'ivy-league',
  'short-quiff',
  'soft-flow',
];

export const DEFAULT_CONTACT_SHEET_ROOT = path.join('contact-sheets', 'front');
export const DEFAULT_PROFILE_REFERENCE_ROOT = path.join('contact-sheets', 'reference-front');
export const DEFAULT_LEFT_PROFILE_SHEET_ROOT = path.join('contact-sheets', 'left-profile');
export const DEFAULT_RIGHT_PROFILE_ASYM_SHEET_ROOT = path.join('contact-sheets', 'right-profile-asym');
export const DEFAULT_OUTPUT_ROOT = path.join('public', 'assets', 'haircuts');
export const DEFAULT_CELL_SIZE = 362;

export function faceShapeById(id) {
  const faceShape = FACE_SHAPES.find((item) => item.id === id);
  if (!faceShape) throw new Error(`Unknown face shape: ${id}`);
  return faceShape;
}

export function beardStateById(id) {
  const beardState = BEARD_STATES.find((item) => item.id === id);
  if (!beardState) throw new Error(`Unknown beard state: ${id}`);
  return beardState;
}

export function canonicalAssetPath({ root = DEFAULT_OUTPUT_ROOT, faceShape, beardState, haircut }) {
  return path.join(root, faceShape, beardState, `${haircut}.png`);
}

export function angledAssetPath({ root = DEFAULT_OUTPUT_ROOT, faceShape, beardState, angle, haircut }) {
  return path.join(root, faceShape, beardState, angle, `${haircut}.png`);
}

export function contactSheetPath({ root = DEFAULT_CONTACT_SHEET_ROOT, faceShape, beardState }) {
  return path.join(root, `${faceShape}-${beardState}.png`);
}

export function profileReferenceSheetPath({ root = DEFAULT_PROFILE_REFERENCE_ROOT, faceShape, beardState }) {
  return path.join(root, `${faceShape}-${beardState}.png`);
}

export function profileContactSheetPath({ root, faceShape, beardState }) {
  return path.join(root, `${faceShape}-${beardState}.png`);
}

export function contactSheetPrompt({ faceShape, beardState }) {
  const face = faceShapeById(faceShape);
  const beard = beardStateById(beardState);
  const haircutList = HAIRCUTS.map((haircut) => haircut.prompt).join(', ');

  return [
    `Create a 4x3 contact sheet of the same fictional young Eastern European man, age 22-27, light skin, ${face.prompt}, ${beard.prompt}, consistent face identity, same neutral expression, same chest-up barber portrait framing, same gray studio/barbershop backdrop, same lighting and camera angle in every cell. Each cell shows a different men's haircut while preserving the same person identity and the same face shape and facial hair state.`,
    '',
    'Hairstyles in reading order, left to right, top to bottom:',
    `${haircutList}.`,
    '',
    'Style:',
    'realistic grooming reference photos, modern Eastern European barber aesthetic, natural hair texture, neutral grooming presentation.',
    '',
    'Composition:',
    'exact 4 columns by 3 rows grid, equal-size cells, small consistent padding between cells, each portrait centered and uncropped at the head, enough margin around hair.',
    '',
    'Important constraints:',
    'no text, no labels, no watermark, no logo, no different people, no hats, no glasses, no jewelry, no tattoos, no dramatic fashion styling, no exaggerated editorial posing.',
    '',
    face.constraint,
    beard.constraint,
  ].join('\n');
}

export function profileContactSheetPrompt({ faceShape, beardState, angle }) {
  const face = faceShapeById(faceShape);
  const beard = beardStateById(beardState);
  const direction = angle === 'right-profile' ? 'right' : 'left';
  const facing = angle === 'right-profile' ? 'screen-right' : 'screen-left';
  const haircutList = HAIRCUTS.map((haircut) => haircut.prompt).join(', ');

  return [
    `Use the provided front reference contact sheet for identity and grooming continuity. Create a 4x3 contact sheet of the same fictional young Eastern European man, age 22-27, light skin, ${face.prompt}, ${beard.prompt}.`,
    `Camera direction: true ${direction} side profile in every cell, the person faces ${facing}.`,
    'Preserve the same person identity, face shape, facial hair state, neutral expression, gray studio/barbershop backdrop, controlled lighting, chest-up crop, clothing, and composition across all cells.',
    '',
    'Hairstyles in reading order, left to right, top to bottom:',
    `${haircutList}.`,
    '',
    'Style:',
    'realistic grooming reference photos, modern Eastern European barber aesthetic, natural hair texture, neutral grooming presentation.',
    '',
    'Composition:',
    'exact 4 columns by 3 rows grid, equal-size cells, small consistent padding between cells, each side-profile portrait centered and uncropped at the head, enough margin around hair and beard.',
    '',
    'Important constraints:',
    'no text, no labels, no watermark, no logo, no different people, no hats, no glasses, no jewelry, no tattoos, no dramatic fashion styling, no exaggerated editorial posing.',
    '',
    face.constraint,
    beard.constraint,
  ].join('\n');
}
