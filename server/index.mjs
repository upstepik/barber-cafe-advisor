import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env.local');
const DIST_DIR = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || readEnvFile().PORT || 8787);
const MAX_BODY_BYTES = 18 * 1024 * 1024;
const SHOULD_SERVE_DIST = process.env.SERVE_DIST === '1' || (process.env.NODE_ENV === 'production' && fs.existsSync(DIST_DIR));

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function readEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return {};

  const values = {};
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    values[key] = value;
    if (!process.env[key]) process.env[key] = value;
  }
  return values;
}

readEnvFile();

const allowedValues = {
  faceShape: ['oval', 'round', 'square', 'long', 'unknown'],
  beard: ['none', 'stubble', 'short_beard', 'full_beard', 'unknown'],
  topLength: ['very_short', 'short', 'medium', 'long', 'unknown'],
  currentSides: ['fresh_short', 'grown', 'natural', 'unknown'],
  hairType: ['thin', 'normal', 'thick', 'wavy', 'unknown'],
  boneMass: ['light', 'medium', 'strong', 'unknown'],
};

const russianLabels = {
  faceShape: {
    oval: 'овальная форма лица',
    round: 'круглая форма лица',
    square: 'квадратная форма лица',
    long: 'вытянутая форма лица',
    unknown: 'форма лица читается неуверенно',
  },
  beard: {
    none: 'без бороды',
    stubble: 'есть щетина',
    short_beard: 'есть короткая борода',
    full_beard: 'есть полная борода',
    unknown: 'борода по фото читается неуверенно',
  },
  topLength: {
    very_short: 'верх очень короткий',
    short: 'верх короткий',
    medium: 'верх средней длины',
    long: 'верх длинный',
    unknown: 'длину сверху трудно оценить',
  },
  currentSides: {
    fresh_short: 'бока уже короткие',
    grown: 'бока заметно отросли',
    natural: 'бока выглядят более натурально',
    unknown: 'состояние боков неочевидно',
  },
  hairType: {
    thin: 'волосы ближе к тонким',
    normal: 'волосы выглядят нормальными по плотности',
    thick: 'волосы выглядят густыми',
    wavy: 'волосы выглядят волнистыми',
    unknown: 'тип волос читается неуверенно',
  },
  boneMass: {
    light: 'костная структура выглядит более лёгкой',
    medium: 'костная структура выглядит сбалансированной',
    strong: 'костная структура выглядит более выраженной',
    unknown: 'костную структуру сложно оценить точно',
  },
};

function containsCyrillic(text) {
  return /[А-Яа-яЁёІіЇїЄє]/.test(String(text || ''));
}

function localizePhotoQualityText(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Кадр принят.';

  const lower = raw.toLowerCase();
  if (['good', 'great', 'ok', 'okay', 'accepted', 'usable', 'clear', 'pass'].includes(lower)) {
    return 'Кадр принят.';
  }
  if (['poor', 'bad'].includes(lower)) {
    return 'Качество слабое: нужен более ровный свет и меньше движения.';
  }
  if (['fair', 'average'].includes(lower)) {
    return 'Качество среднее: лучше добавить свет и замереть перед снимком.';
  }
  if (lower.includes('dark') || lower.includes('lighting')) {
    return 'Темновато: нужен более ровный свет на лице.';
  }
  if (lower.includes('blur') || lower.includes('motion')) {
    return 'Есть смаз: лучше не двигаться в момент снимка.';
  }
  if (lower.includes('profile')) {
    return 'Профиль читается слабо: нужно довернуть голову сильнее.';
  }
  if (!containsCyrillic(raw)) {
    return 'Кадр принят, но качество можно улучшить.';
  }

  return raw;
}

function buildRussianNotes(output) {
  const summary = [
    russianLabels.faceShape[output.faceShape],
    russianLabels.beard[output.beard],
    russianLabels.topLength[output.topLength],
    russianLabels.currentSides[output.currentSides],
    russianLabels.hairType[output.hairType],
  ].filter(Boolean);

  const uncertainFields = Object.entries(output.confidence || {})
    .filter(([, value]) => Number(value) > 0 && Number(value) < 0.65)
    .map(([key]) => {
      const map = {
        faceShape: 'форме лица',
        beard: 'бороде',
        topLength: 'длине сверху',
        currentSides: 'бокам',
        hairType: 'типу волос',
        boneMass: 'костной структуре',
      };
      return map[key];
    })
    .filter(Boolean);

  const weakPhotos = Object.values(output.photoQuality || {}).filter((value) =>
    /слаб|средн|темновато|смаз|не хватает|нечёт|профиль/i.test(String(value || '')),
  );

  const parts = [];
  if (summary.length) {
    parts.push(`По фото система сейчас видит: ${summary.join(', ')}.`);
  }
  if (output.boneMass && output.boneMass !== 'unknown') {
    parts.push(`${russianLabels.boneMass[output.boneMass]}.`);
  }
  if (uncertainFields.length) {
    parts.push(`Ниже уверенность по: ${uncertainFields.join(', ')}.`);
  }
  if (weakPhotos.length) {
    parts.push('Точность оценки снижают свет, смаз или слабая читаемость профиля.');
  }

  return parts.join(' ').slice(0, 700);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  response.end(JSON.stringify(body));
}

function sendFile(response, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  response.writeHead(200, {
    'content-type': contentType,
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });

  fs.createReadStream(filePath).pipe(response);
}

function safeResolveFromDist(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const withoutQuery = decoded.split('?')[0].split('#')[0];
  const relative = withoutQuery.replace(/^[\\/]+/, '');
  const joined = path.join(DIST_DIR, relative);
  const normalized = path.normalize(joined);
  if (!normalized.startsWith(DIST_DIR)) return null;
  return normalized;
}

function shouldServeIndex(request) {
  const accept = String(request.headers.accept || '');
  if (accept.includes('text/html')) return true;
  return request.method === 'GET';
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = '';

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Payload is too large. Compress photos before analysis.'));
        request.destroy();
        return;
      }
      body += chunk;
    });

    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function validatePhotos(photos) {
  const keys = ['front', 'leftProfile', 'rightProfile'];
  if (!photos || typeof photos !== 'object') return false;
  return keys.every((key) => typeof photos[key] === 'string' && photos[key].startsWith('data:image/jpeg;base64,'));
}

function normalizeBaseUrl(value) {
  return (value || 'https://api.vibecode-claude.online').replace(/\/+$/, '');
}

async function findSonnetModel(baseUrl, apiKey) {
  const response = await fetch(`${baseUrl}/v1/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`Cannot list models (${response.status}). Set VIBECODE_MODEL explicitly.`);
  }

  const data = await response.json();
  const models = Array.isArray(data.data) ? data.data : [];
  const sonnet = models.find((model) => /sonnet/i.test(model.id || '') && /(4\.6|4-6|46)/i.test(model.id || ''));
  if (!sonnet?.id) {
    throw new Error('Sonnet 4.6 model was not found. Set VIBECODE_MODEL to the exact provider model id.');
  }

  return sonnet.id;
}

async function resolveModel(baseUrl, apiKey, preferredModel) {
  if (preferredModel) return preferredModel;
  return findSonnetModel(baseUrl, apiKey);
}

function extractJson(text) {
  if (!text) throw new Error('Model returned an empty response.');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('Model response did not contain JSON.');
  return JSON.parse(candidate.slice(start, end + 1));
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function normalizeAnalysis(input) {
  const output = {};
  for (const [key, values] of Object.entries(allowedValues)) {
    output[key] = values.includes(input?.[key]) ? input[key] : 'unknown';
  }

  output.confidence = {};
  for (const key of Object.keys(allowedValues)) {
    output.confidence[key] = clampConfidence(input?.confidence?.[key]);
  }

  output.photoQuality = {
    front: localizePhotoQualityText(input?.photoQuality?.front),
    leftProfile: localizePhotoQualityText(input?.photoQuality?.leftProfile),
    rightProfile: localizePhotoQualityText(input?.photoQuality?.rightProfile),
  };
  const rawNotes = String(input?.notes || '').trim();
  output.notes = containsCyrillic(rawNotes) ? rawNotes.slice(0, 700) : buildRussianNotes(output);

  return output;
}

function buildMessages(photos) {
  const prompt = [
    'You are a barber consultation vision assistant for a men haircut recommendation product.',
    'Analyze three client photos: front, left profile, right profile.',
    'Return strict JSON only. No markdown. No extra prose.',
    'All free-text fields must be in Russian.',
    '',
    'Classify only these enum values:',
    'faceShape: oval, round, square, long, unknown',
    'beard: none, stubble, short_beard, full_beard, unknown',
    'topLength: very_short, short, medium, long, unknown',
    'currentSides: fresh_short, grown, natural, unknown',
    'hairType: thin, normal, thick, wavy, unknown',
    'boneMass: light, medium, strong, unknown',
    '',
    'Guidance:',
    '- faceShape is based on visible facial proportions and jaw/cheek/vertical balance.',
    '- boneMass means visual bone structure strength: jaw, cheekbones, skull/head structure.',
    '- topLength estimates current hair length on top, not desired style.',
    '- currentSides estimates whether sides are already short, grown out, natural, or unclear.',
    '- beard must reflect current facial hair only. Clean shaven must be none.',
    '- If uncertain, use unknown and low confidence.',
    '- photoQuality values must be short Russian assessments for each photo.',
    '- notes must be plain Russian, concise, and useful for a barber or client review screen.',
    '',
    'JSON schema:',
    '{"faceShape":"","beard":"","topLength":"","currentSides":"","hairType":"","boneMass":"","confidence":{"faceShape":0,"beard":0,"topLength":0,"currentSides":0,"hairType":0,"boneMass":0},"photoQuality":{"front":"","leftProfile":"","rightProfile":""},"notes":""}',
  ].join('\n');

  return [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'text', text: 'front photo' },
        { type: 'image_url', image_url: { url: photos.front } },
        { type: 'text', text: 'left profile photo' },
        { type: 'image_url', image_url: { url: photos.leftProfile } },
        { type: 'text', text: 'right profile photo' },
        { type: 'image_url', image_url: { url: photos.rightProfile } },
      ],
    },
  ];
}

async function callVision(photos) {
  const apiKey = process.env.VIBECODE_API_KEY;
  const baseUrl = normalizeBaseUrl(process.env.VIBECODE_BASE_URL);
  if (!apiKey) throw new Error('Missing VIBECODE_API_KEY in .env.local.');

  let model = await resolveModel(baseUrl, apiKey, process.env.VIBECODE_MODEL);
  const makeRequest = () => fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: buildMessages(photos),
    }),
  });

  let response = await makeRequest();
  if ((response.status === 400 || response.status === 404) && process.env.VIBECODE_MODEL) {
    model = await findSonnetModel(baseUrl, apiKey);
    response = await makeRequest();
  }

  const text = await response.text();
  if (!response.ok) {
    if (response.status === 404 || response.status === 400) {
      throw new Error(`Vision model request failed (${response.status}). Check VIBECODE_MODEL or provider compatibility.`);
    }
    throw new Error(`Vision request failed (${response.status}).`);
  }

  const data = JSON.parse(text);
  const content = data?.choices?.[0]?.message?.content;
  return normalizeAnalysis(extractJson(content));
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/api/face-scan') {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    try {
      const body = await readBody(request);
      const payload = JSON.parse(body || '{}');
      if (!validatePhotos(payload.photos)) {
        sendJson(response, 400, { error: 'Expected JPEG data URLs for front, leftProfile, and rightProfile.' });
        return;
      }

      const analysis = await callVision(payload.photos);
      sendJson(response, 200, { analysis });
    } catch (error) {
      sendJson(response, 500, { error: error.message || 'Face scan failed.' });
    }

    return;
  }

  if (SHOULD_SERVE_DIST && request.method === 'GET') {
    const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const resolved = safeResolveFromDist(requestedPath);
    if (!resolved) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        sendFile(response, resolved);
        return;
      }

      if (shouldServeIndex(request)) {
        const indexPath = path.join(DIST_DIR, 'index.html');
        if (fs.existsSync(indexPath)) {
          sendFile(response, indexPath);
          return;
        }
      }
    } catch {
      // fall through to 404 below
    }
  }

  sendJson(response, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  const mode = SHOULD_SERVE_DIST ? 'api+dist' : 'api-only';
  console.log(`Server (${mode}) listening on http://localhost:${PORT}`);
});
