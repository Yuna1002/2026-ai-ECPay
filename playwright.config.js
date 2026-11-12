// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * E2E 測試直接打已啟動的專案（預設 http://localhost:3001），不另外啟動測試伺服器。
 * 執行前請先 `node server.js` 或 `npm start`。
 */
module.exports = defineConfig({
  testDir: './tests/e2e',
  // 綠界測試環境回應較慢，整個購物＋付款流程給 3 分鐘
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3001',
    viewport: { width: 1440, height: 900 },
    locale: 'zh-TW',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
