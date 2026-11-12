import { defineConfig } from 'vitest/config';

// 單元／API 測試：每個測試檔各自使用一個記憶體 SQLite，不會動到 database.sqlite
export default defineConfig({
  test: {
    globals: true,
    include: ['tests/*.test.js'],
    env: {
      NODE_ENV: 'test',
      DB_PATH: ':memory:',
      JWT_SECRET: 'test-jwt-secret',
    },
    fileParallelism: false,
    sequence: {
      files: [
        'tests/shipping.test.js',
        'tests/auth.test.js',
        'tests/products.test.js',
        'tests/cart.test.js',
        'tests/orders.test.js',
        'tests/adminProducts.test.js',
        'tests/adminOrders.test.js',
      ],
    },
    hookTimeout: 10000,
  },
});
