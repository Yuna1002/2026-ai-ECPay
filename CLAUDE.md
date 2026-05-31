# CLAUDE.md

## 專案概述

花卉電商平台 — Node.js + Express.js + SQLite + EJS + Tailwind CSS v4

本專案是一個全端花卉電商網站，包含前台購物流程（商品瀏覽、購物車、結帳）與後台管理（商品、訂單管理）。使用 JWT 做身份驗證，支援遊客購物車（Session-based）與會員購物車（JWT-based）雙模式。

## 常用指令

```bash
# 開發（只啟動 server，不重新 build CSS）
node server.js

# 正式啟動（build CSS 後再啟動 server）
npm start

# 開發模式 CSS watch
npm run dev:css

# 單獨 build CSS
npm run css:build

# 執行所有測試
npm test

# 產生 OpenAPI 規格檔
npm run openapi
```

## 關鍵規則

- **JWT_SECRET 必填**：server.js 啟動時若未設定 `JWT_SECRET` 環境變數，process 會直接 `exit(1)`，這是刻意設計的防呆機制
- **購物車雙模式認證**：購物車路由使用自訂 `dualAuth`，優先嘗試 JWT，若 header 中有 Authorization 但 token 無效，直接回 401（不回退至 session），只有完全無 Authorization header 才改用 `X-Session-Id`
- **結帳只能用 JWT**：`POST /api/orders` 使用標準 `authMiddleware`，遊客購物車無法直接結帳，須先登入
- **訂單建立為 transaction**：建立訂單時，同時寫入 order + order_items、扣減 products.stock、清空購物車，四步驟在同一 SQLite transaction 內完成，確保原子性
- **功能開發使用 docs/plans/ 記錄計畫；完成後移至 docs/plans/archive/**

## 詳細文件

- [./docs/README.md](./docs/README.md) — 項目介紹與快速開始
- [./docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 架構、目錄結構、資料流
- [./docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 開發規範、命名規則
- [./docs/FEATURES.md](./docs/FEATURES.md) — 功能列表與完成狀態
- [./docs/TESTING.md](./docs/TESTING.md) — 測試規範與指南
- [./docs/CHANGELOG.md](./docs/CHANGELOG.md) — 更新日誌
