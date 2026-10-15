import { test, expect, type Page } from '@playwright/test';

/**
 * Web-app E2E: the real Tauri bridge (MockScriptSource) is running on port
 * 48765 and the production bundle is served from the Playwright webServer.
 *
 * The mock script cycles (in order, 20s each): Espresso → Cruel Summer →
 * City Lights (artist unknown) → loops. Track selection is driven entirely by
 * desktop detection now (the search bar and curated catalogue were removed).
 */

const header = (page: Page) => page.getByRole('banner');
const trackTitle = (page: Page) => header(page).locator('h1');

test.describe('Web UI against the native bridge', () => {
  test('boots and detects the Espresso track from the native bridge', async ({ page }) => {
    await page.goto('/');

    await expect(trackTitle(page)).toContainText('Espresso', { timeout: 20_000 });
    await expect(header(page)).toContainText('Sabrina Carpenter');
    await expect(header(page)).toContainText('Desktop (native)', { timeout: 20_000 });

    // The docked lyrics surface renders with its view toggle and provider footer.
    await expect(page.getByText('Karaoke (Synced)')).toBeVisible();
    await expect(page.getByText('Full Sheet')).toBeVisible();
    await expect(page.getByText(/^Provider:/)).toBeVisible();
  });

  test('switches to the Most Listened view', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Most Listened' });
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Hot' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lifetime' })).toBeVisible();

    await toggle.click();
    await expect(page.getByText('Full Sheet')).toBeVisible();
  });

  test('switches tracks as the bridge reports a new snapshot', async ({ page }) => {
    await page.goto('/');

    await expect(trackTitle(page)).toBeVisible({ timeout: 20_000 });
    // Scripted step 2 (Cruel Summer) arrives within a 60s loop; wait for it.
    await expect(trackTitle(page)).toContainText('Cruel Summer', { timeout: 45_000 });
    await expect(header(page)).toContainText('Taylor Swift');
  });

  test('maps an unknown desktop track and surfaces it in the header', async ({ page }) => {
    await page.goto('/');
    // Scripted step 3 (City Lights, artist null) becomes `Unknown Artist`.
    await expect(trackTitle(page)).toContainText('City Lights', { timeout: 60_000 });
    await expect(header(page)).toContainText('Unknown Artist');
    await expect(page.getByText(/^Provider:/)).toBeVisible();
  });
});
