import { test, expect } from '@playwright/test';

test('着陆页可进入免登录流水，并打开记账弹窗', async ({ page }, testInfo) => {
  await page.goto('/pages/landing.html', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/每日记账本|翔翔记账/);
  await page.getByRole('link', { name: /免登录直接体验/ }).first().click();
  await expect(page).toHaveURL(/\/pages\/bills\.html/);
  if (testInfo.project.name.startsWith('mobile')) {
    await page.getByRole('link', { name: '记一笔', exact: true }).click();
  } else {
    await page.getByRole('button', { name: /记一笔/ }).first().click();
  }
  await expect(page.getByRole('dialog')).toBeVisible();
});
