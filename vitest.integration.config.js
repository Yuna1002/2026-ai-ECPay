import { defineConfig } from 'vitest/config';

// Integration 測試：使用記憶體 SQLite，完全不讀寫專案的 database.sqlite
export default defineConfig({
  test: {
    globals: true,
    include: ['tests/integration/**/*.test.js'],
    env: {
      NODE_ENV: 'test',
      DB_PATH: ':memory:',
      JWT_SECRET: 'integration-test-jwt-secret',
    },
    fileParallelism: false,
    hookTimeout: 15000,
    testTimeout: 15000,
  },
});
