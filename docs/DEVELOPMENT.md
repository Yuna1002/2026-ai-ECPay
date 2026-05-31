# 開發規範

## 模組系統

本專案後端使用 **CommonJS**（`require` / `module.exports`），因為 Express ~4.16 的生態系慣例。

vitest.config.js 使用 **ESM** import 語法（`import { defineConfig } from 'vitest/config'`），這是 Vitest 設定檔的標準格式，不影響其他檔案。

**前端 JS**（`public/js/`）使用全域變數與 `<script>` 標籤載入，不使用 ES module bundler。

## 命名規則對照表

| 類別 | 慣例 | 範例 |
|------|------|------|
| 路由檔案 | camelCase + Routes 後綴 | `authRoutes.js`, `adminProductRoutes.js` |
| Middleware 檔案 | camelCase + Middleware / Handler | `authMiddleware.js`, `errorHandler.js` |
| 資料庫欄位 | snake_case | `user_id`, `order_no`, `created_at` |
| API request body 欄位 | camelCase | `recipientName`, `productId`, `image_url`（例外：直接對應 DB 欄位時） |
| API response 欄位 | snake_case（與 DB 欄位一致） | `order_no`, `total_amount` |
| 前端 JS 頁面檔案 | kebab-case | `admin-products.js`, `order-detail.js` |
| EJS 頁面檔案 | kebab-case | `product-detail.ejs`, `order-detail.ejs` |
| 環境變數 | SCREAMING_SNAKE_CASE | `JWT_SECRET`, `ADMIN_EMAIL` |
| UUID 識別碼 | 全欄位使用 UUID v4 作為 PK | `uuidv4()` from `uuid` 套件 |

**注意**：`cart_items.session_id` 使用 underscore，但請求中的 header 是 `X-Session-Id`（HTTP header 慣例）。

## 新增 API 端點步驟

1. **確認路由歸屬**：判斷是新路由檔還是加入現有路由檔（參考 [ARCHITECTURE.md 路由總覽](./ARCHITECTURE.md)）
2. **在路由函式前加 JSDoc OpenAPI 註解**（`/** @openapi ... */`），格式見下方說明
3. **實作 handler**：遵循統一 API 回應格式（`{ data, error, message }`）
4. **若需認證**，選擇適當 middleware：
   - 一般使用者 → `authMiddleware`
   - 管理員 → `authMiddleware` + `adminMiddleware`（兩者必須依序 `router.use(authMiddleware, adminMiddleware)`）
   - 購物車雙模式 → 使用 cartRoutes 內的 `dualAuth` 函式
5. **更新測試**：在對應 test 檔案加入新測試案例
6. **更新 FEATURES.md**：記錄新功能
7. 執行 `npm run openapi` 重新產生 `openapi.json`

## 新增 Middleware 步驟

1. 在 `src/middleware/` 新增 `.js` 檔案
2. 函式簽名為 `function middleware(req, res, next)` 或 `function errorHandler(err, req, res, next)`
3. 在 `app.js` 或對應路由中 `app.use()` / `router.use()` 掛載
4. 若是全域 middleware，掛載順序在路由之前；錯誤 handler 在路由之後

## 新增資料庫表格步驟

1. 在 `src/database.js` 的 `initializeDatabase()` 中新增 `CREATE TABLE IF NOT EXISTS ...`
2. 注意欄位型別：SQLite 支援 TEXT / INTEGER / REAL / BLOB
3. 所有 PK 使用 `TEXT PRIMARY KEY`（UUID v4）
4. 時間欄位使用 `TEXT NOT NULL DEFAULT (datetime('now'))`（ISO 8601 格式）
5. 若有外鍵，加上 `FOREIGN KEY (...) REFERENCES ...(id)`（pragma `foreign_keys = ON` 已啟用）
6. 若需要 seed 資料，在同檔案新增 seed 函式並在 `initializeDatabase()` 末端呼叫

## 環境變數管理

`.env` 由 `app.js` 第一行 `require('dotenv').config()` 載入，因此 `server.js`（require app 之前）在 `require('./app')` 時才載入環境變數。

`server.js` 在 `require('./app')` 之後立即檢查 `process.env.JWT_SECRET`，若未設定則 `process.exit(1)`。

**測試環境**中環境變數應設定在 `.env` 或 `NODE_ENV=test` 對應設定，`src/database.js` 的 `seedAdminUser()` 中有以下效能優化：

```javascript
const saltRounds = process.env.NODE_ENV === 'test' ? 1 : 10;
```

測試時 bcrypt saltRounds 降為 1，大幅加速測試執行。

## JSDoc OpenAPI 格式

每個 API route handler 前必須加 JSDoc OpenAPI 標記，格式如下：

```javascript
/**
 * @openapi
 * /api/your-endpoint:
 *   post:
 *     summary: 端點說明
 *     tags: [TagName]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [field1]
 *             properties:
 *               field1:
 *                 type: string
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: 請求錯誤
 */
```

安全性定義（在 `swagger-config.js` 已定義）：
- `bearerAuth`：`Authorization: Bearer <token>`（JWT）
- `sessionId`：`X-Session-Id`（header，apiKey 類型）

## 計畫歸檔流程

新功能開發前，在 `docs/plans/` 建立計畫文件：

### 計畫檔案命名格式

```
docs/plans/YYYY-MM-DD-<feature-name>.md
```

範例：`docs/plans/2026-05-31-ecpay-integration.md`

### 計畫文件結構

```markdown
# [功能名稱]

## User Story
As a [角色], I want to [動作], so that [目的].

## Spec
- 功能詳細規格
- API 端點定義
- 資料庫異動

## Tasks
- [ ] 任務 1
- [ ] 任務 2
- [ ] 撰寫測試
- [ ] 更新文件
```

### 完成後的歸檔步驟

1. 將計畫檔案移至 `docs/plans/archive/`
2. 更新 [FEATURES.md](./FEATURES.md) 中對應功能狀態為已完成
3. 在 [CHANGELOG.md](./CHANGELOG.md) 新增版本紀錄
