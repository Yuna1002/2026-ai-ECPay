/**
 * 將 openapi.json 轉換為 Postman Collection v2.1
 *
 * - 所有請求網址使用 {{baseUrl}}（預設 http://localhost:3001）
 * - Collection 變數：baseUrl、token、sessionId
 * - 登入／註冊成功後自動把 JWT 存到 {{token}}
 * - 需要登入（bearerAuth）的 API 自動繼承 Collection 層級的 Bearer {{token}}
 * - 支援遊客購物車（sessionId）的 API 自動帶 X-Session-Id: {{sessionId}}
 *
 * 用法：node scripts/generate-postman.js（或 npm run postman，會先重新產生 openapi.json）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OPENAPI_PATH = path.join(ROOT, 'openapi.json');
const OUTPUT_DIR = path.join(ROOT, 'postman');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'flower-shop.postman_collection.json');

const DEFAULT_BASE_URL = 'http://localhost:3001';
const POSTMAN_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// 讓範例請求可以直接送出的預設 body（覆寫 schema 自動產生的值）
const BODY_OVERRIDES = {
  'POST /api/auth/login': { email: 'admin@hexschool.com', password: '12345678' },
  'POST /api/auth/register': { email: 'user-{{$timestamp}}@example.com', password: 'password123', name: '測試會員' },
  'POST /api/orders': {
    recipientName: '王小明',
    recipientEmail: 'buyer@example.com',
    recipientAddress: '台北市大安區復興南路一段 100 號',
    shippingMethod: 'home_delivery',
    isUrgent: false,
  },
  'POST /api/shipping/quote': {
    subtotal: 1200,
    shippingMethod: 'home_delivery',
    address: '台北市大安區復興南路一段 100 號',
    isUrgent: false,
  },
};

// 回應中帶 JWT 的端點：成功後存入 {{token}}
const SAVE_TOKEN_ENDPOINTS = new Set(['POST /api/auth/login', 'POST /api/auth/register']);

/* ---------------- 工具函式 ---------------- */

function stableId(seed) {
  const h = crypto.createHash('md5').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function resolveRef(spec, ref) {
  return ref.replace(/^#\//, '').split('/').reduce((obj, key) => obj?.[key], spec);
}

/** 依 JSON Schema 產生範例值 */
function exampleFromSchema(spec, schema, depth = 0) {
  if (!schema || depth > 6) return null;
  if (schema.$ref) return exampleFromSchema(spec, resolveRef(spec, schema.$ref), depth + 1);
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];

  switch (schema.type) {
    case 'object': {
      const out = {};
      for (const [key, prop] of Object.entries(schema.properties || {})) {
        out[key] = exampleFromSchema(spec, prop, depth + 1);
      }
      return out;
    }
    case 'array':
      return [exampleFromSchema(spec, schema.items, depth + 1)];
    case 'integer':
    case 'number':
      return schema.minimum !== undefined ? schema.minimum : 1;
    case 'boolean':
      return false;
    case 'string':
      if (schema.format === 'email') return 'user@example.com';
      if (schema.format === 'date-time') return new Date(0).toISOString();
      if (schema.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
      return '';
    default:
      return schema.properties ? exampleFromSchema(spec, { ...schema, type: 'object' }, depth) : null;
  }
}

function buildUrl(apiPath, parameters) {
  // OpenAPI 的 {id} → Postman 的 :id
  const postmanPath = apiPath.replace(/\{([^}]+)\}/g, ':$1');
  const segments = postmanPath.split('/').filter(Boolean);

  const query = parameters
    .filter(p => p.in === 'query')
    .map(p => ({
      key: p.name,
      value: p.schema?.default !== undefined ? String(p.schema.default) : '',
      description: p.description || '',
      disabled: !p.required,
    }));

  const variable = parameters
    .filter(p => p.in === 'path')
    .map(p => ({ key: p.name, value: '', description: p.description || `${p.name}（必填）` }));

  const enabledQuery = query.filter(q => !q.disabled);
  const qs = enabledQuery.length ? `?${enabledQuery.map(q => `${q.key}=${q.value}`).join('&')}` : '';

  const url = {
    raw: `{{baseUrl}}${postmanPath}${qs}`,
    host: ['{{baseUrl}}'],
    path: segments,
  };
  if (query.length) url.query = query;
  if (variable.length) url.variable = variable;
  return url;
}

function buildBody(spec, endpointKey, requestBody) {
  if (!requestBody?.content) return undefined;
  const content = requestBody.content;

  if (content['application/json']) {
    const example = BODY_OVERRIDES[endpointKey] ?? exampleFromSchema(spec, content['application/json'].schema);
    return {
      mode: 'raw',
      raw: JSON.stringify(example ?? {}, null, 2),
      options: { raw: { language: 'json' } },
    };
  }

  if (content['application/x-www-form-urlencoded']) {
    const example = exampleFromSchema(spec, content['application/x-www-form-urlencoded'].schema) || {};
    return {
      mode: 'urlencoded',
      urlencoded: Object.entries(example).map(([key, value]) => ({ key, value: String(value ?? ''), type: 'text' })),
    };
  }
  return undefined;
}

function securityNames(operation, spec) {
  const security = operation.security ?? spec.security ?? [];
  return new Set(security.flatMap(req => Object.keys(req)));
}

function saveTokenScript() {
  return {
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: [
        "pm.test('回應成功', function () {",
        '  pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
        '});',
        '',
        'const json = pm.response.json();',
        'if (json && json.data && json.data.token) {',
        "  pm.collectionVariables.set('token', json.data.token);",
        "  console.log('JWT 已儲存至 {{token}}');",
        '}',
      ],
    },
  };
}

/* ---------------- 轉換 ---------------- */

function convert(spec) {
  const folders = new Map();

  for (const [apiPath, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const endpointKey = `${method.toUpperCase()} ${apiPath}`;
      const parameters = [...(pathItem.parameters || []), ...(operation.parameters || [])]
        .map(p => (p.$ref ? resolveRef(spec, p.$ref) : p));
      const security = securityNames(operation, spec);

      const header = [];
      const body = buildBody(spec, endpointKey, operation.requestBody);
      if (body?.mode === 'raw') header.push({ key: 'Content-Type', value: 'application/json' });
      if (security.has('sessionId')) {
        header.push({
          key: 'X-Session-Id',
          value: '{{sessionId}}',
          description: '遊客購物車識別碼；若已設定 {{token}}，伺服器會優先使用 JWT',
        });
      }

      const request = {
        method: method.toUpperCase(),
        header,
        url: buildUrl(apiPath, parameters),
        description: [operation.summary, operation.description].filter(Boolean).join('\n\n'),
      };
      if (body) request.body = body;
      // bearerAuth → 不設定 auth，繼承 Collection 的 Bearer {{token}}；其餘明確設為 noauth
      if (!security.has('bearerAuth')) request.auth = { type: 'noauth' };

      const item = {
        id: stableId(endpointKey),
        name: operation.summary || endpointKey,
        request,
        response: [],
      };
      if (SAVE_TOKEN_ENDPOINTS.has(endpointKey)) item.event = [saveTokenScript()];

      const folderName = (operation.tags && operation.tags[0]) || 'Default';
      if (!folders.has(folderName)) folders.set(folderName, []);
      folders.get(folderName).push(item);
    }
  }

  return {
    info: {
      _postman_id: stableId(spec.info?.title || 'collection'),
      name: spec.info?.title || 'API',
      description: [
        spec.info?.description || '',
        '',
        '由 `npm run postman` 從 openapi.json 自動產生。',
        '1. 先執行「Auth / 使用者登入」，JWT 會自動存入 `{{token}}`',
        '2. 需要登入的 API 會自動帶 `Authorization: Bearer {{token}}`',
        '3. `{{sessionId}}` 若為空，送出請求前會自動產生一組 UUID（遊客購物車用）',
      ].join('\n'),
      schema: POSTMAN_SCHEMA,
    },
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{token}}', type: 'string' }],
    },
    event: [
      {
        listen: 'prerequest',
        script: {
          type: 'text/javascript',
          exec: [
            '// 遊客購物車：sessionId 為空時自動產生',
            "if (!pm.collectionVariables.get('sessionId')) {",
            "  pm.collectionVariables.set('sessionId', pm.variables.replaceIn('{{$guid}}'));",
            '}',
          ],
        },
      },
    ],
    variable: [
      { key: 'baseUrl', value: DEFAULT_BASE_URL, type: 'string' },
      { key: 'token', value: '', type: 'string' },
      { key: 'sessionId', value: '', type: 'string' },
    ],
    item: [...folders.entries()].map(([name, items]) => ({ name, item: items })),
  };
}

/* ---------------- 驗證 ---------------- */

function validate(collection) {
  const errors = [];
  if (collection.info?.schema !== POSTMAN_SCHEMA) errors.push('info.schema 不是 v2.1.0');
  const vars = Object.fromEntries((collection.variable || []).map(v => [v.key, v.value]));
  for (const key of ['baseUrl', 'token', 'sessionId']) {
    if (!(key in vars)) errors.push(`缺少變數 ${key}`);
  }
  if (vars.baseUrl !== DEFAULT_BASE_URL) errors.push(`baseUrl 預設值應為 ${DEFAULT_BASE_URL}`);
  if (collection.auth?.type !== 'bearer') errors.push('Collection 未設定 Bearer 認證');

  const requests = collection.item.flatMap(folder => folder.item);
  if (requests.length === 0) errors.push('沒有任何請求');
  for (const item of requests) {
    if (!item.request.url.raw.startsWith('{{baseUrl}}')) errors.push(`${item.name} 未使用 {{baseUrl}}`);
  }
  if (!requests.some(i => i.event?.some(e => e.script.exec.join('\n').includes("collectionVariables.set('token'")))) {
    errors.push('沒有任何請求會自動儲存 token');
  }

  // 確認輸出為有效 JSON（序列化後可再解析且內容一致）
  const json = JSON.stringify(collection, null, 2);
  const reparsed = JSON.parse(json);
  if (JSON.stringify(reparsed) !== JSON.stringify(collection)) errors.push('JSON 來回轉換結果不一致');

  return { errors, json, requestCount: requests.length };
}

function main() {
  if (!fs.existsSync(OPENAPI_PATH)) {
    console.error('找不到 openapi.json，請先執行 npm run openapi');
    process.exit(1);
  }
  const spec = JSON.parse(fs.readFileSync(OPENAPI_PATH, 'utf8'));
  const collection = convert(spec);
  const { errors, json, requestCount } = validate(collection);

  if (errors.length) {
    console.error('Postman Collection 驗證失敗：\n- ' + errors.join('\n- '));
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, json + '\n');
  // 寫入後再讀回解析一次，確保檔案本身是有效 JSON
  JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  console.log(`Postman Collection 已產生：${path.relative(ROOT, OUTPUT_PATH)}（${requestCount} 個請求）`);
}

if (require.main === module) main();

module.exports = { convert, validate };
