import { expect, test } from '@playwright/test';

test('homepage loads and has expected elements', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/PeteZah/);
  // Logo image should be present
  const logo = page.locator('.header-logo img');
  await expect(logo).toBeVisible();
  const iframeElem = page.locator('#mainFrame');
  await expect(iframeElem).toHaveAttribute('src', 'pages/home.html');
});
