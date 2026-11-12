# 測試規範與指南

## 測試框架

- **Vitest** ^2：測試執行器，使用 `globals: true`（不需手動 import describe/it/expect）
- **Supertest** ^7：HTTP 整合測試，直接對 Express app 發送請求，無需啟動伺服器
- **Playwright Test** 1.62：E2E 測試，直接操作已啟動的 `http://localhost:3001` 與綠界測試環境

## 測試指令

| 指令 | 內容 | 資料庫 |
|------|------|--------|
| `npm run test:unit` | `tests/*.test.js`（設定檔 `vitest.config.js`） | 記憶體 SQLite（`DB_PATH=:memory:`） |
| `npm run test:integration` | `tests/integration/**/*.test.js`（設定檔 `vitest.integration.config.js`） | 記憶體 SQLite（`DB_PATH=:memory:`） |
| `npm test` | 依序執行上面兩項 | — |
| `npm run test:e2e` | `tests/e2e/*.spec.js`（設定檔 `playwright.config.js`） | **打正在執行的專案**，會寫入 `database.sqlite` |
| `npm run postman` | 重新產生 `openapi.json` 並轉成 `postman/flower-shop.postman_collection.json` | — |

`src/database.js` 會優先讀取 `DB_PATH` 環境變數；Vitest 兩份設定都在 `test.env` 設 `DB_PATH=':memory:'`，因此 unit／integration 測試**不會讀寫**專案的 `database.sqlite`。Vitest 預設以測試檔為單位隔離模組，每個測試檔各自拿到一個全新、已 seed 的記憶體資料庫。

## 測試檔案一覽

| 測試檔案 | 測試對象 | 主要測試案例 |
|---------|---------|------------|
| `tests/setup.js` | 輔助函式 | — |
| `tests/shipping.test.js` | `src/utils/shipping.js`（純單元測試） | 宅配 120、超商 60、小計 1,499／1,500、偏遠 +200、急件 +250、多項附加費、滿額免運＋附加費、偏遠關鍵字、參數驗證 |
| `tests/auth.test.js` | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/profile` | 成功註冊、重複 email、成功登入、密碼錯誤、取得 profile |
| `tests/products.test.js` | `GET /api/products`, `GET /api/products/:id` | 商品列表、分頁、單一商品、404 |
| `tests/cart.test.js` | `GET/POST/PATCH/DELETE /api/cart` | 遊客模式增刪改查、會員模式加入、無效商品 |
| `tests/orders.test.js` | `POST/GET/PATCH /api/orders`、`POST /api/shipping/quote` | 建立訂單、空購物車、未認證、訂單列表、訂單詳情、404、運費與總額正確、非法 shippingMethod／isUrgent、運費試算 |
| `tests/adminProducts.test.js` | `GET/POST/PUT/DELETE /api/admin/products` | CRUD 流程、一般使用者被拒、未認證被拒 |
| `tests/adminOrders.test.js` | `GET /api/admin/orders`, `GET /api/admin/orders/:id` | 訂單列表、status 篩選、訂單詳情、一般使用者被拒 |
| `tests/integration/helpers.js` | Integration 輔助函式 | 建立／清除測試商品與會員、直接查 DB |
| `tests/integration/checkout.test.js` | 登入 → 商品 → 購物車 → `POST /api/orders` | 回應格式、orders／order_items 寫入、運費與總額、庫存扣除、購物車清空；失敗時交易回滾、不扣庫存 |
| `tests/e2e/ecpay-webatm-checkout.spec.js` | 前台 UI + 綠界測試環境 | 登入 → 加購物車 → 結帳（超商取貨）→ 綠界網路 ATM（台灣土地銀行）→ 返回站點 → 已付款／`paid` |

## 執行順序與依賴關係

測試檔案必須**依序**執行（`fileParallelism: false`），順序由 `vitest.config.js` 中的 `sequence.files` 定義：

```
shipping.test.js         ← 純函式，不依賴 DB，放最前面
→ auth.test.js
  → products.test.js
    → cart.test.js
      → orders.test.js   ← 依賴 cart.test.js 在同 DB 中有商品存在
        → adminProducts.test.js
          → adminOrders.test.js  ← beforeAll 會建立訂單，需要 products 存在
```

依賴原因：
- 每個測試檔有自己的記憶體 DB，檔案之間不共享資料；固定順序是沿用既有設定，方便閱讀輸出
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

### 2. 同一測試檔內的資料庫狀態

同一個測試檔內的 test case 共用同一個記憶體 DB，前一個 case 建立的資料（如訂單）可能影響後續 case 的計數或列表結果。建議：
- 用唯一的 email / session ID 隔離測試間的使用者與購物車
- 不依賴特定的訂單總數，改用 `.toBeGreaterThan(0)` 而非 `.toBe(1)`

### 3. admin seed 帳號的脆弱性

`getAdminToken()` 依賴 `.env` 中的 `ADMIN_EMAIL` / `ADMIN_PASSWORD`（或預設值）。若修改 `.env` 預設值，需同步更新 `tests/setup.js` 或確認 `seedAdminUser` 使用相同 env var。

### 4. bcrypt 效能

`src/database.js` 在 `NODE_ENV=test` 時將 saltRounds 設為 1（見 `seedAdminUser()`）。若測試執行緩慢，確認 `NODE_ENV=test` 已設定。

### 5. 訂單測試的前置依賴

`orders.test.js` 的 `beforeAll` 會加商品到購物車，因此測試 case 有執行順序依賴（先建立訂單的 test 跑完後，後續「空購物車」的 test 才成立）。新增 test case 時注意不要在中途清空購物車。

## Integration Test（tests/integration）

- 每個 test case 在 `beforeEach` 建立自己的測試商品（固定價格與庫存）與測試會員（API 註冊後再登入），`afterEach` 依外鍵順序刪除，不依賴 seed 商品的庫存
- 驗證除了看 HTTP 回應，也直接查 DB（`orders`、`order_items`、`products.stock`、`cart_items`）
- 交易回滾測試：用 `CREATE TEMP TRIGGER` 讓「第二個品項」寫入 `order_items` 時 `RAISE(ABORT)`；此時第一個品項的品項寫入與扣庫存已在交易中執行，藉此驗證整筆 rollback（無訂單、無品項、庫存與購物車不變），測試結束即 `DROP TRIGGER`

## E2E Test（tests/e2e）

**前置條件**：專案已在 `http://localhost:3001` 執行（`node server.js`），可用 `E2E_BASE_URL` 覆寫。測試不會自己啟動伺服器。首次在新環境執行需 `npx playwright install chromium`。

- 帳號 `admin@hexschool.com` / `12345678`；開始前會用 API 清空此帳號購物車，確保金額可預期
- 綠界流程：網路ATM → 台灣土地銀行 → 前往付款 → 關閉測試環境提示 → 土地銀行模擬頁（`pay-stage.ecpay.com.tw/MockMPPost/LandWebAtm`）按 `Save`
- 「付款成功／返回商店」：專案設定了 `OrderResultURL`，綠界付款完成後以自動送出的表單直接 POST 回 `/api/payments/ecpay-result`，**不會停在成功頁**。測試兩種情況都接受（出現「返回商店」就點擊），並攔截綠界結果頁的回應，斷言 `RtnCode=1`、`PaymentType=WebATM_LAND`、金額正確
- 截圖輸出至 `tests/e2e/screenshots/`（`03-order-paid-after-return.png` 為返回站點後的已付款畫面），也會附在 HTML 報告（`npx playwright show-report`）；截圖與報告皆不納入版控
- **副作用**：每次執行會在 `database.sqlite` 新增一筆已付款訂單並扣減 1 個庫存

## Postman Collection

`npm run postman` → `scripts/generate-postman.js` 讀 `openapi.json` 輸出 `postman/flower-shop.postman_collection.json`（v2.1，不納入版控，需要時執行指令重新產生）：

- Collection 變數：`baseUrl`（預設 `http://localhost:3001`）、`token`、`sessionId`
- Collection 層級 Bearer `{{token}}`：`bearerAuth` 的 API 自動繼承；公開 API 設為 `noauth`
- 「使用者登入」「使用者註冊」成功後以 test script 把 `data.token` 存進 `{{token}}`
- 購物車 API 另帶 `X-Session-Id: {{sessionId}}`；`sessionId` 為空時由 Collection prerequest script 自動產生 UUID
- 產生後會檢查 JSON 有效性與上述條件，不符合即以非 0 結束

## 執行測試

```bash
# 執行 unit + integration
npm test

# 執行特定測試檔
npx vitest run --config vitest.config.js tests/auth.test.js

# 觀察模式（開發時使用）
npx vitest
```

測試結果中若出現 `FAIL`，優先確認：
1. `JWT_SECRET` 是否設定（見 `.env`）
2. 測試執行順序是否被改動
3. E2E 失敗時先確認 `http://localhost:3001` 有在執行，再看 `playwright-report/` 的 trace
