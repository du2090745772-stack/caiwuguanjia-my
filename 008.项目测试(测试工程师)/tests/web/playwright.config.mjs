import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: '*.spec.mjs',
  timeout: 30_000,
  use: {
    baseURL: process.env.TEST_WEB_URL || 'http://127.0.0.1:3000',
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  reporter: [
    ['list'],
    ['html', { outputFolder: `${root}/测试报告/网页-html`, open: 'never' }],
    ['junit', { outputFile: `${root}/测试报告/网页-junit.xml` }],
  ],
  outputDir: `${root}/测试报告/网页-artifacts`,
});
