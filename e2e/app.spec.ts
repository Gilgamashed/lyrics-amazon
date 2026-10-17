import { test, expect, type Page } from '@playwright/test';

/**
 * Web-app E2E: the real Tauri bridge (MockScriptSource) is running on port
 * 48765 and the production bundle is served from the Playwright webServer.
 *
 * The mock script loops every 30s (10s each): Espresso → Cruel Summer →
 * City Lights (artist unknown). The script clock starts when the bridge does,
 * so on a slow runner the bridge may already be mid-loop before Chrome
 * navigates; assertions therefore accept any scripted track or allow a full
 * loop to elapse. Track selection is driven entirely by desktop detection now
 * (the search bar and curated catalogue were removed).
 */

const header = (page: Page) => page.getByRole('banner');
const trackTitle = (page: Page) => header(page).locator('h1');
const LOOP_MS = 40_000;

test.describe('Web UI against the native bridge', () => {
  test('boots and reflects the native bridge track', async ({ page }) => {
    await page.goto('/');

    // Any scripted track proves native detection; the exact one depends on
    // where the bridge's 30s loop is when the page loads.
    await expect(trackTitle(page)).toHaveText(
      /Espresso|Cruel Summer|City Lights/,
      { timeout: 20_000 }
    );
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
    // Scripted step 2 (Cruel Summer) arrives within the 30s loop; allow a full
    // loop so the assertion cannot miss the window on a slow runner.
    await expect(trackTitle(page)).toContainText('Cruel Summer', { timeout: LOOP_MS });
    await expect(header(page)).toContainText('Taylor Swift');
  });

  test('maps an unknown desktop track and surfaces it in the header', async ({ page }) => {
    await page.goto('/');
    // Scripted step 3 (City Lights, artist null) becomes `Unknown Artist`.
    await expect(trackTitle(page)).toContainText('City Lights', { timeout: LOOP_MS });
    await expect(header(page)).toContainText('Unknown Artist');
    await expect(page.getByText(/^Provider:/)).toBeVisible();
  });

  test('shows the real album art and the detected app id for the scripted track', async ({
    page,
  }) => {
    await page.goto('/');
    // Every scripted step carries album art, so the lockup image renders
    // regardless of which track is active when the page loads.
    await expect(trackTitle(page)).toBeVisible({ timeout: 20_000 });
    await expect(header(page).locator('img')).toBeVisible();
    await expect(page.getByTestId('detection-chip')).toHaveAttribute(
      'title',
      /app id: AmazonMusic\.exe/
    );
  });

  test('keeps the panel header and tabs visible at a small viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 560 });
    await page.goto('/');

    await expect(trackTitle(page)).toBeVisible({ timeout: 20_000 });
    // The Karaoke/Full Sheet tabs stay reachable at narrow widths.
    await expect(page.getByRole('button', { name: /Karaoke/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Full Sheet' })).toBeVisible();

    // Both lyric surfaces own a visible scrollbar container.
    await expect(page.locator('.custom-scrollbar').first()).toBeVisible();

    // The panel header (with the tabs) stays pinned after scrolling the body.
    await page.getByRole('button', { name: 'Full Sheet' }).click();
    const scroller = page.locator('.custom-scrollbar').first();
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.getByRole('button', { name: 'Full Sheet' })).toBeInViewport();
  });
});
