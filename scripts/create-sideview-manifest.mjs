import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const workspace = process.cwd();
const sourceRoot = path.join(workspace, 'public', 'assets', 'haircuts');
const outputRoot = path.join(workspace, 'public', 'assets', 'haircuts-sideviews', 'people');
const manifestPath = path.join(workspace, 'public', 'assets', 'haircuts-sideviews', 'people-manifest.json');
const mannequinOutputRoot = path.join(workspace, 'public', 'assets', 'haircuts-sideviews', 'mannequins');
const mannequinManifestPath = path.join(workspace, 'public', 'assets', 'haircuts-sideviews', 'mannequin-manifest.json');
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);

async function listImages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listImages(fullPath);
      if (!imageExtensions.has(path.extname(entry.name).toLowerCase())) return [];
      return [fullPath];
    }),
  );
  return files.flat();
}

function pathParts(relativePath) {
  const parts = relativePath.split(path.sep);
  const fileName = parts.at(-1);
  const slug = path.basename(fileName, path.extname(fileName));
  const folders = parts.slice(0, -1);
  const knownShapes = new Set(['oval', 'round', 'square', 'long']);
  const knownBeards = new Set(['none', 'stubble', 'short_beard', 'full_beard']);
  return {
    slug,
    faceShape: folders.find((part) => knownShapes.has(part)) || 'unknown',
    beard: folders.find((part) => knownBeards.has(part)) || 'unknown',
  };
}

function promptFor({ direction, slug, faceShape, beard }) {
  const facing = direction === 'left' ? 'screen-left' : 'screen-right';
  return [
    'Create a photorealistic side-profile image from the provided front or three-quarter hairstyle reference.',
    `Direction: true ${direction} profile, the person faces ${facing}.`,
    `Haircut: preserve the same ${slug} haircut, hair length, fade/taper, texture, beard state, and styling intent.`,
    `Face shape metadata: ${faceShape}. Beard metadata: ${beard}.`,
    'Keep the same person-like visual style, studio lighting, crop, background tone, and premium barber reference quality.',
    'The side view must look like a plausible alternate camera angle of the same hairstyle, not a mirrored front view.',
    'No text, no watermark, no logo, no barber tools, no extra objects.',
  ].join(' ');
}

function mannequinPromptFor({ direction, slug, faceShape, beard }) {
  const facing = direction === 'left' ? 'screen-left' : 'screen-right';
  const beardLine =
    beard === 'full_beard'
      ? 'Add a realistic full dark beard, barber-shaped and attached to the lower face, while keeping the mannequin material pure white.'
      : beard === 'short_beard'
        ? 'Add a realistic short dark beard, cleanly shaped, while keeping the mannequin material pure white.'
        : beard === 'stubble'
          ? 'Add subtle dark stubble texture, restrained and realistic, while keeping the mannequin material pure white.'
          : 'No beard; keep the lower face clean and smooth.';

  return [
    'Create a premium photorealistic studio product image of a white barber mannequin head and bust.',
    `Direction: true ${direction} profile, the mannequin faces ${facing}.`,
    `Haircut: ${slug}; realistic dark hair physically attached to the mannequin, with believable hairline, individual strands, correct side silhouette, and barber-finished shape.`,
    `Face shape: ${faceShape}. Beard state: ${beard}. ${beardLine}`,
    'The mannequin should feel slightly more teenage / youthful than the previous samples: subtly softer jaw, fresher proportions, less heavy mature facial structure, but still a realistic premium mannequin bust, not a child and not a living person.',
    'Material: smooth matte white ceramic/resin, pure white face, sculpted nose, lips, ear, jawline, neck, and bust base.',
    'Composition: vertical portrait, centered, head and upper bust visible, warm neutral background, soft studio shadows, premium barbershop reference quality.',
    'No human skin tone, no text, no watermark, no logo, no barber tools, no hands, no extra objects.',
  ].join(' ');
}

const sources = (await listImages(sourceRoot)).sort((a, b) => a.localeCompare(b));
const jobs = sources.flatMap((sourcePath) => {
  const relativePath = path.relative(sourceRoot, sourcePath);
  const parsed = path.parse(relativePath);
  const meta = pathParts(relativePath);

  return ['left', 'right'].map((direction) => ({
    source: path.relative(workspace, sourcePath).replaceAll(path.sep, '/'),
    output: path
      .join(path.relative(workspace, outputRoot), parsed.dir, `${parsed.name}-${direction}.png`)
      .replaceAll(path.sep, '/'),
    direction,
    haircut: meta.slug,
    faceShape: meta.faceShape,
    beard: meta.beard,
    prompt: promptFor({ direction, ...meta }),
  }));
});

const mannequinJobs = sources.flatMap((sourcePath) => {
  const relativePath = path.relative(sourceRoot, sourcePath);
  const parsed = path.parse(relativePath);
  const meta = pathParts(relativePath);

  return ['left', 'right'].map((direction) => ({
    sourceContext: path.relative(workspace, sourcePath).replaceAll(path.sep, '/'),
    output: path
      .join(path.relative(workspace, mannequinOutputRoot), parsed.dir, `${parsed.name}-${direction}.png`)
      .replaceAll(path.sep, '/'),
    direction,
    haircut: meta.slug,
    faceShape: meta.faceShape,
    beard: meta.beard,
    styleRule: 'slightly younger teen-adjacent white mannequin; not a child; realistic premium bust',
    prompt: mannequinPromptFor({ direction, ...meta }),
  }));
});

await mkdir(path.dirname(manifestPath), { recursive: true });
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceRoot: path.relative(workspace, sourceRoot).replaceAll(path.sep, '/'),
      outputRoot: path.relative(workspace, outputRoot).replaceAll(path.sep, '/'),
      totalSourceImages: sources.length,
      totalJobs: jobs.length,
      jobs,
    },
    null,
    2,
  )}\n`,
);

await writeFile(
  mannequinManifestPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceRoot: path.relative(workspace, sourceRoot).replaceAll(path.sep, '/'),
      outputRoot: path.relative(workspace, mannequinOutputRoot).replaceAll(path.sep, '/'),
      totalSourceImages: sources.length,
      totalJobs: mannequinJobs.length,
      styleRule: 'Mannequins should be subtly more teenage/youthful than the previous accepted samples, but still premium photorealistic white mannequin busts.',
      jobs: mannequinJobs,
    },
    null,
    2,
  )}\n`,
);

console.log(`Created ${path.relative(workspace, manifestPath)} with ${jobs.length} jobs.`);
console.log(`Created ${path.relative(workspace, mannequinManifestPath)} with ${mannequinJobs.length} jobs.`);
