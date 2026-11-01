---
name: ecpay-e2e-test
description: >
  使用 Playwright MCP 對本專案（花漾生活）進行綠界 ECPay 金流 E2E 測試：
  登入 → 加入購物車 → 結帳 → 綠界信用卡付款 → 3D 驗證 → 確認訂單變為已付款。
  當使用者提到「E2E 測試」「綠界測試」「結帳流程測試」「金流回歸測試」「Playwright 跑一遍購物流程」時使用。
---

# 綠界金流 E2E 測試

## 測試目標

驗證完整鏈路：
`登入 → 加購物車 → 建立訂單 → ECPay AIO 收銀台（信用卡）→ 3D 驗證 → OrderResultURL → QueryTradeInfo 驗證 → orders.status = paid`

> 本專案跑在本機，ECPay 無法回呼 `ReturnURL`，付款結果由後端在 `/api/payments/ecpay-result` 主動呼叫 `QueryTradeInfo/V5` 確認（詳見 `docs/FEATURES.md`「ECPay AIO 金流」）。

## 前置條件

| 項目 | 內容 |
|------|------|
| 伺服器 | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/` 回 200 即可；否則以 `node server.js` 背景啟動（需 `.env` 有 `JWT_SECRET`） |
| 瀏覽器工具 | Playwright MCP（已在 `.mcp.json` 設定），工具名稱 `mcp__playwright__browser_*`；若為 deferred，先用 ToolSearch 一次載入全部要用的工具 |
| 測試帳號 | `admin@hexschool.com` / `12345678` |
| 測試信用卡 | `4311-9522-2222-2222`，CVV 任意 3 碼（用 `222`），有效期限任意未來月年（用 `12` / `30`），3D 驗證碼 `1234` |

## 測試步驟（正常流程）

每一步完成後都要用 `browser_snapshot` 取得最新 ref；**頁面跳轉後 ref 會改變，不可沿用舊 ref**。

| # | 動作 | 工具 | 預期結果 |
|---|------|------|----------|
| 1 | 開啟 `http://localhost:3001/login` | `browser_navigate` | 標題「登入 - 花漾生活」 |
| 2 | 填 Email、密碼 | `browser_fill_form`（textbox） | — |
| 3 | 點「登入」 | `browser_click` | 導向 `/`；導覽列出現「我的訂單」「後台管理」「Admin」 |
| 4 | 點任一商品卡片的「加入購物車」（測試用「繽紛向日葵花束」NT$ 980） | `browser_click` | 導覽列購物車數字 +1 |
| 5 | 開啟 `/cart` | `browser_navigate` | 顯示商品、總計；滿 NT$ 500 顯示免運 |
| 6 | 點「前往結帳」 | `browser_click` | 導向 `/checkout` |
| 7 | 填收件人姓名、Email、收件地址 | `browser_fill_form` | — |
| 8 | 點「確認送出訂單」 | `browser_click` | 導向 `/orders/{id}`；狀態「待付款」；出現「前往綠界付款」按鈕 |
| 9 | 點「前往綠界付款」 | `browser_click` | 跳轉 `payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5`；訂單編號、金額正確 |
| 10 | 信用卡分頁（預設已選）。卡號**必須**用 `browser_type`（`target: #CCpart1`，`slowly: true`，`text: 4311952222222222`）輸入，會自動分段 | `browser_type` | 卡號下方顯示發卡行（VISA / 中國信託），無紅字錯誤 |
| 11 | 填有效期限 `12`/`30`、CVV `222`、持卡人 `WANG XIAO MING`、手機 `0987654321`、帳單地址 | `browser_fill_form` | — |
| 12 | 若出現「測試環境」提示彈窗，點「關閉」 | `browser_click`（`getByRole('button', { name: '關閉' })`） | 彈窗消失 |
| 13 | 點「立即付款」 | `browser_click`（`getByRole('link', { name: '立即付款' })`） | 出現確認彈窗「支付此筆訂單金額 (新台幣)980」 |
| 14 | 點「確定」 | `browser_click` | 跳轉 `cc-stage.ecpay.com.tw/form_ssl.php`（3D 驗證） |
| 15 | 點「取得OTP服務密碼」 | `browser_click` | 顯示「(OTP密碼：1234)」與輸入框 |
| 16 | 輸入 `1234`，點「送出(Submit)」 | `browser_type` + `browser_click` | 導回 `http://localhost:3001/orders/{id}?payment=success` |
| 17 | 等 3 秒後驗證頁面 | `browser_wait_for` + `browser_take_screenshot` | 狀態「已付款」，提示「付款完成，花藝師開始準備你的花」，總計與商品明細正確 |

## 異常情境

### 已實測驗證

| 情境 | 觸發方式 | 實際結果 / 處理 |
|------|----------|-----------------|
| 卡號欄位驗證錯誤 | 用 `browser_fill_form` 一次填入卡號 | 綠界顯示紅字「請輸入信用卡卡號」，點「立即付款」沒有任何跳轉。改用 `browser_type` + `slowly: true` 逐字輸入即可 |
| 測試環境警示彈窗 | 第一次點「立即付款」 | 彈出「您目前正在使用的是綠界科技的付款測試環境…」，未關閉前付款不會送出；關閉後須再點一次「立即付款」 |

### 待實測（尚未驗證，執行時請實際跑過再記錄結果）

- 3D 驗證輸入錯誤 OTP（例如 `0000`）：預期不會變為已付款，訂單維持「待付款」
- 3D 驗證頁點「取消(Cancel)」：預期導回網站且訂單維持「待付款」，可重新付款
- 其他必填欄位留空（持卡人姓名、手機、CVV）：預期綠界顯示欄位錯誤、不跳轉
- 未登入直接開 `/checkout`：預期導向登入或回 401（`POST /api/orders` 只接受 JWT）
- 購物車為空時結帳：預期被擋下，不建立訂單

## 注意事項

- **會產生副作用**：每次跑完會留下一筆「已付款」訂單並扣減 1 個庫存；回歸測試前先確認庫存足夠。
- 綠界頁面 console 會出現 `facebook.com` 被 CSP 擋住的錯誤，來自綠界本身，可忽略。
- 綠界為測試環境（`payment-stage` / `cc-stage`），請勿在此輸入真實卡片。
- 截圖與 snapshot 會存在 `.playwright-mcp/`，不要 commit。
- 不要 `git commit`，除非使用者明確同意（見專案 CLAUDE.md）。

## 回報格式

測試完成後以繁體中文回報：每個步驟的通過／失敗、訂單編號、最終訂單狀態，以及失敗時的截圖路徑與 console 錯誤。
