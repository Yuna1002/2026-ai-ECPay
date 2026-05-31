# 花卉電商平台

花卉電商網站，支援商品瀏覽、遊客/會員購物車、線上結帳及後台管理。

## 技術棧

| 分類 | 技術 |
|------|------|
| 執行環境 | Node.js |
| Web 框架 | Express.js ~4.16 |
| 資料庫 | SQLite（better-sqlite3 ^12） |
| 身份驗證 | JWT（jsonwebtoken ^9） + Session Header |
| 密碼雜湊 | bcrypt ^6 |
| 視圖引擎 | EJS ^5 |
| CSS 框架 | Tailwind CSS v4（@tailwindcss/cli） |
| ID 產生 | UUID v4 |
| API 文件 | swagger-jsdoc（OpenAPI 3.0.3） |
| 測試框架 | Vitest ^2 + Supertest ^7 |

## 快速開始

```bash
# 1. 安裝相依套件
npm install

# 2. 設定環境變數（複製後填入真實值）
cp .env.example .env

# 3. 編輯 .env，至少設定 JWT_SECRET
#    （未設定 JWT_SECRET 伺服器無法啟動）

# 4. 啟動伺服器（會自動建立 SQLite DB + seed 資料）
node server.js

# 5. 開啟瀏覽器
# 前台：http://localhost:3001
# 後台：http://localhost:3001/admin/products
```

預設管理員帳號（由 .env 的 ADMIN_EMAIL / ADMIN_PASSWORD 控制）：
- Email：`admin@hexschool.com`
- 密碼：`12345678`

## 環境變數

| 變數名 | 說明 | 必要 | 預設值 |
|--------|------|------|--------|
| `JWT_SECRET` | JWT 簽名金鑰 | **必填** | 無（未設定會 exit(1)） |
| `PORT` | 伺服器 port | 否 | `3001` |
| `BASE_URL` | 後端基礎 URL | 否 | `http://localhost:3001` |
| `FRONTEND_URL` | CORS 允許的前端 URL | 否 | `http://localhost:3001` |
| `ADMIN_EMAIL` | 種子管理員 email | 否 | `admin@hexschool.com` |
| `ADMIN_PASSWORD` | 種子管理員密碼 | 否 | `12345678` |
| `ECPAY_MERCHANT_ID` | 綠界商店代號 | 否 | `3002607` |
| `ECPAY_HASH_KEY` | 綠界 HashKey | 否 | — |
| `ECPAY_HASH_IV` | 綠界 HashIV | 否 | — |
| `ECPAY_ENV` | 綠界環境（staging/production） | 否 | `staging` |

## 常用指令

| 指令 | 說明 |
|------|------|
| `node server.js` | 啟動開發伺服器（不 rebuild CSS） |
| `npm start` | Build CSS 後啟動（正式環境用） |
| `npm run dev:css` | Tailwind CSS watch 模式 |
| `npm run css:build` | 一次性 minify CSS |
| `npm test` | 執行所有整合測試 |
| `npm run openapi` | 產生 openapi.json 規格檔 |

## 文件索引

| 文件 | 說明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系統架構、目錄結構、API 路由總覽、DB Schema |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 開發規範、命名規則、新增模組步驟、計畫歸檔 |
| [FEATURES.md](./FEATURES.md) | 功能清單、行為描述、錯誤碼說明 |
| [TESTING.md](./TESTING.md) | 測試規範、測試檔說明、撰寫指引 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本更新紀錄 |
