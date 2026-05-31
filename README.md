# 花卉電商平台

一個全端花卉電商網站，提供商品瀏覽、遊客 / 會員雙模式購物車、ECPay 線上金流、以及後台管理介面。

## 技術棧

| 分類 | 技術 |
|------|------|
| 執行環境 | Node.js |
| Web 框架 | Express.js ~4.16 |
| 資料庫 | SQLite（better-sqlite3 ^12） |
| 身份驗證 | JWT（jsonwebtoken ^9）+ Session Header |
| 密碼雜湊 | bcrypt ^6 |
| 視圖引擎 | EJS ^5 |
| CSS 框架 | Tailwind CSS v4 |
| 金流 | 綠界科技 ECPay AIO |
| API 文件 | swagger-jsdoc（OpenAPI 3.0.3） |
| 測試框架 | Vitest ^2 + Supertest ^7 |

## 功能特色

- **前台**：商品瀏覽、購物車（遊客 Session / 會員 JWT 雙模式）、線上結帳
- **金流**：ECPay AIO 串接（信用卡、ATM、超商代碼），本地主動查詢付款結果
- **後台**：商品管理（CRUD）、訂單管理、庫存追蹤
- **認證**：JWT 身份驗證，7 天有效，防止 email 枚舉攻擊

## 快速開始

```bash
# 1. 安裝相依套件
npm install

# 2. 設定環境變數
cp .env.example .env
# 編輯 .env，至少填入 JWT_SECRET（未設定伺服器無法啟動）

# 3. 啟動伺服器（自動建立 SQLite DB 與 seed 資料）
node server.js

# 前台：http://localhost:3001
# 後台：http://localhost:3001/admin/products
```

預設管理員帳號（由 `.env` 的 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 控制）：
- Email：`admin@hexschool.com`
- 密碼：`12345678`

## 環境變數

| 變數名 | 說明 | 必要 |
|--------|------|------|
| `JWT_SECRET` | JWT 簽名金鑰 | **必填** |
| `PORT` | 伺服器 port（預設 `3001`） | 否 |
| `BASE_URL` | 後端基礎 URL | 否 |
| `ADMIN_EMAIL` | 種子管理員 email | 否 |
| `ADMIN_PASSWORD` | 種子管理員密碼 | 否 |
| `ECPAY_MERCHANT_ID` | 綠界商店代號 | 否 |
| `ECPAY_HASH_KEY` | 綠界 HashKey | 否 |
| `ECPAY_HASH_IV` | 綠界 HashIV | 否 |
| `ECPAY_ENV` | 綠界環境（`staging` / `production`） | 否 |

## 常用指令

| 指令 | 說明 |
|------|------|
| `node server.js` | 啟動開發伺服器（不 rebuild CSS） |
| `npm start` | Build CSS 後啟動（正式環境用） |
| `npm run dev:css` | Tailwind CSS watch 模式 |
| `npm run css:build` | 一次性 minify CSS |
| `npm test` | 執行所有整合測試 |
| `npm run openapi` | 產生 openapi.json 規格檔 |

## 專案結構

```
├── app.js              # Express app 設定（middleware、路由）
├── server.js           # 伺服器進入點（環境變數驗證、DB 初始化）
├── src/
│   ├── database.js     # SQLite 初始化與 seed
│   ├── middleware/     # authMiddleware、dualAuth
│   ├── routes/         # API 路由（auth、products、cart、orders、payment）
│   └── utils/          # ecpayHelper（CheckMacValue、AES 加密）
├── views/              # EJS 頁面模板
├── public/             # 靜態資源（CSS、JS）
├── tests/              # Vitest 整合測試
└── docs/               # 詳細技術文件
```

## 文件

| 文件 | 說明 |
|------|------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系統架構、路由總覽、DB Schema、資料流 |
| [docs/FEATURES.md](docs/FEATURES.md) | 功能清單、API 行為、錯誤碼說明 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 開發規範、命名規則、新增模組步驟 |
| [docs/TESTING.md](docs/TESTING.md) | 測試規範、測試檔說明、撰寫指引 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 版本更新紀錄 |
