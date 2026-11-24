import { test, expect } from '@playwright/test';

test('免登录记账：录入支出后在本机账单中可查', async ({ page }, testInfo) => {
  await page.goto('/pages/landing.html', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: /免登录直接体验/ }).first().click();
  await expect(page).toHaveURL(/bills\.html/);
  if (testInfo.project.name.startsWith('mobile')) await page.getByRole('link', { name: '记一笔', exact: true }).click();
  else await page.getByRole('button', { name: /记一笔/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#amount-input').fill('35.50');
  await expect(page.locator('#amount-input')).toHaveValue('35.50');
  await page.locator('#note-input').fill('自动化测试猫粮');
  await expect(page.locator('#note-input')).toHaveValue('自动化测试猫粮');
  await page.locator('#btn-save-record').click();
  await expect(page.getByText('自动化测试猫粮')).toBeVisible();
  await expect(page.getByText(/35\.50/).first()).toBeVisible();
});

test('账号注册：表单校验并创建真实测试账号', async ({ page }) => {
  const username = `qa${Date.now().toString(36)}`;
  await page.goto('/pages/register.html', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/注册/);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill('QaPass123!');
  await page.locator('#confirmPassword').fill('wrong123');
  await page.locator('#agreementCheck').check({ force: true });
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole('alert')).toContainText('两次输入的密码不一致');
  await page.locator('#confirmPassword').fill('QaPass123!');
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/profile\.html/);
  await expect(page.locator('body')).toContainText(username);
});
