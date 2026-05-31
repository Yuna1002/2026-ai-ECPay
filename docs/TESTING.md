# 測試規範與指南

## 測試框架

- **Vitest** ^2：測試執行器，使用 `globals: true`（不需手動 import describe/it/expect）
- **Supertest** ^7：HTTP 整合測試，直接對 Express app 發送請求，無需啟動伺服器

## 測試檔案一覽

| 測試檔案 | 測試對象 | 主要測試案例 |
|---------|---------|------------|
| `tests/setup.js` | 輔助函式 | — |
| `tests/auth.test.js` | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/profile` | 成功註冊、重複 email、成功登入、密碼錯誤、取得 profile |
| `tests/products.test.js` | `GET /api/products`, `GET /api/products/:id` | 商品列表、分頁、單一商品、404 |
| `tests/cart.test.js` | `GET/POST/PATCH/DELETE /api/cart` | 遊客模式增刪改查、會員模式加入、無效商品 |
| `tests/orders.test.js` | `POST/GET/PATCH /api/orders` | 建立訂單、空購物車、未認證、訂單列表、訂單詳情、404 |
| `tests/adminProducts.test.js` | `GET/POST/PUT/DELETE /api/admin/products` | CRUD 流程、一般使用者被拒、未認證被拒 |
| `tests/adminOrders.test.js` | `GET /api/admin/orders`, `GET /api/admin/orders/:id` | 訂單列表、status 篩選、訂單詳情、一般使用者被拒 |

## 執行順序與依賴關係

測試檔案必須**依序**執行（`fileParallelism: false`），順序由 `vitest.config.js` 中的 `sequence.files` 定義：

```
auth.test.js
  → products.test.js
    → cart.test.js
      → orders.test.js   ← 依賴 cart.test.js 在同 DB 中有商品存在
        → adminProducts.test.js
          → adminOrders.test.js  ← beforeAll 會建立訂單，需要 products 存在
```

依賴原因：
- 所有測試共用同一個 `database.sqlite`（測試時不使用 in-memory DB）
- `orders.test.js` 的 `beforeAll` 需要先加商品到購物車，依賴 seed 商品存在
- `adminOrders.test.js` 的 `beforeAll` 需要完整建立一筆訂單（register → add cart → place order）

## 輔助函式說明（tests/setup.js）

```javascript
// 使用 seed admin 帳號登入，回傳 JWT token string
async function getAdminToken(): Promise<string>
// admin 帳號：admin@hexschool.com / 12345678（可被 .env 覆寫）

// 動態產生唯一 email 並註冊新使用者，回傳 { token, user }
async function registerUser(overrides?: {
  email?: string   // 預設：test-<timestamp>-<random>@example.com
  password?: string // 預設：'password123'
  name?: string    // 預設：'測試使用者'
}): Promise<{ token: string, user: object }>
```

## 撰寫新測試步驟

### 1. 決定測試檔案位置

- 測試既有功能 → 加入對應的現有 test 檔案
- 全新功能模組 → 在 `tests/` 新建 `<module>.test.js`，並加入 `vitest.config.js` 的 `sequence.files` 末端

### 2. 基本測試結構

```javascript
const { app, request, getAdminToken, registerUser } = require('./setup');

describe('功能模組 API', () => {
  let token;

  beforeAll(async () => {
    // 準備測試前置條件（取 token、建立測試資料）
    token = await getAdminToken();
  });

  it('應正確執行某操作', async () => {
    const res = await request(app)
      .post('/api/your-endpoint')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'value' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('id');
  });
});
```

### 3. 回應格式斷言慣例

所有 API 回應遵循統一格式，測試斷言建議包含：

```javascript
// 成功情境
expect(res.status).toBe(200); // 或 201
expect(res.body).toHaveProperty('data');
expect(res.body).toHaveProperty('error', null);
expect(res.body).toHaveProperty('message');

// 失敗情境
expect(res.status).toBe(400); // 或 401, 403, 404, 409
expect(res.body).toHaveProperty('data', null);
expect(res.body).toHaveProperty('error');
expect(res.body.error).not.toBeNull();
```

### 4. 購物車 session 模式測試

```javascript
const sessionId = 'test-session-' + Date.now(); // 確保唯一，避免測試間干擾

const res = await request(app)
  .post('/api/cart')
  .set('X-Session-Id', sessionId)
  .send({ productId, quantity: 1 });
```

## 常見陷阱

### 1. 測試執行順序很重要

不要在 `adminOrders.test.js` 前加入會清除 products 的操作，因為 `adminOrders.test.js` 的 `beforeAll` 需要 products 表中有資料。

### 2. 共享資料庫狀態

測試之間共用同一個 `database.sqlite`，某個測試建立的資料（如訂單）可能影響後續測試的計數或列表結果。建議：
- 用唯一的 email / session ID 隔離測試間的使用者與購物車
- 不依賴特定的訂單總數，改用 `.toBeGreaterThan(0)` 而非 `.toBe(1)`

### 3. admin seed 帳號的脆弱性

`getAdminToken()` 依賴 `.env` 中的 `ADMIN_EMAIL` / `ADMIN_PASSWORD`（或預設值）。若修改 `.env` 預設值，需同步更新 `tests/setup.js` 或確認 `seedAdminUser` 使用相同 env var。

### 4. bcrypt 效能

`src/database.js` 在 `NODE_ENV=test` 時將 saltRounds 設為 1（見 `seedAdminUser()`）。若測試執行緩慢，確認 `NODE_ENV=test` 已設定。

### 5. 訂單測試的前置依賴

`orders.test.js` 的 `beforeAll` 會加商品到購物車，因此測試 case 有執行順序依賴（先建立訂單的 test 跑完後，後續「空購物車」的 test 才成立）。新增 test case 時注意不要在中途清空購物車。

## 執行測試

```bash
# 執行所有測試
npm test

# 執行特定測試檔
npx vitest run tests/auth.test.js

# 觀察模式（開發時使用）
npx vitest
```

測試結果中若出現 `FAIL`，優先確認：
1. `JWT_SECRET` 是否設定（見 `.env`）
2. `database.sqlite` 是否有正確的 seed 資料（刪除 db 檔重新啟動可重建）
3. 測試執行順序是否被改動
