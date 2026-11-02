const { test, expect } = require('@playwright/test');
const token = 'a'.repeat(64);
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});
test('download page displays both version choices without starting a download', async ({ page }) => {
  let downloads = 0;
  await page.route('**/api/download/validate/*', route => route.fulfill({ json: { usesLeft: 3, expiresAt: '2026-12-01T00:00:00Z', versions: [
    { id: 'standard', title: 'Standard PDF', size: '98 MB', description: 'Smaller file for Kindle, phones, and tablets.' },
    { id: 'original', title: 'Full-resolution PDF', size: '1.2 GB', description: 'Maximum detail for large screens and zooming.' },
  ] } }));
  await page.route('**/api/download/*?version=*', route => { downloads++; return route.abort(); });
  await page.goto(`/download/${token}`);
  await expect(page.getByText(/3 downloads remaining/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download Standard PDF' })).toHaveAttribute('href', new RegExp(`/api/download/${token}\\?version=standard$`));
  await expect(page.getByRole('link', { name: 'Download Full-resolution PDF' })).toHaveAttribute('href', new RegExp(`/api/download/${token}\\?version=original$`));
  expect(downloads).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('expired download page explains the error without showing file links', async ({ page }) => {
  await page.route('**/api/download/validate/*', route => route.fulfill({ status: 403, json: { error: 'This download link is invalid, expired, or has no downloads left.' } }));
  await page.goto(`/download/${token}`);
  await expect(page.getByRole('alert')).toContainText('expired');
  await expect(page.getByRole('link', { name: /^Download / })).toHaveCount(0);
});
