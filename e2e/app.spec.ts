import { test, expect, type Page } from '@playwright/test';

/**
 * Web-app E2E: the real Tauri bridge (MockScriptSource) is running on port
 * 48765 and the production bundle is served from the Playwright webServer.
 *
 * The mock script cycles (in order, 20s each): Espresso → Cruel Summer →
 * City Lights (artist unknown) → loops.
 */

const bannerTitle = (page: Page) =>
  page.getByRole('banner').locator('p').filter({ hasText: /Espresso|Cruel Summer|City Lights/ });

test.describe('Web UI against the native bridge', () => {
  test('boots into the curated Espresso track with karaoke lyrics', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('banner')).toContainText('Amazon Music');
    await expect(page.getByRole('banner').locator('p', { hasText: 'Espresso' })).toContainText(
      'Sabrina Carpenter',
      { timeout: 15_000 }
    );
    // A curated Espresso lyric line is rendered in the karaoke window.
    await expect(page.getByText("That's that me espresso").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/\d+ lines parsed/)).toBeVisible();
  });

  test('detects playback from the native desktop bridge', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Desktop (native)')).toBeVisible({ timeout: 20_000 });
  });

  test('switches tracks as the bridge reports a new snapshot', async ({ page }) => {
    await page.goto('/');

    await expect(bannerTitle(page).first()).toBeVisible({ timeout: 15_000 });
    // Scripted step 2 (Cruel Summer) arrives within a 60s loop; wait for it.
    await expect(page.getByRole('banner').locator('p', { hasText: 'Cruel Summer' })).toContainText(
      'Taylor Swift',
      { timeout: 45_000 }
    );
  });

  test('maps an unknown desktop track and surfaces it in the banner', async ({ page }) => {
    await page.goto('/');
    // Scripted step 3 (City Lights, artist null) becomes `Unknown Artist`.
    await expect(page.getByRole('banner').locator('p', { hasText: 'City Lights' })).toContainText(
      'Unknown Artist',
      { timeout: 60_000 }
    );
    // Lyric retrieval kicks off for the remote track; cache layer tolerates it
    // and the karaoke window still renders the previous lyrics without crashing.
    await expect(page.getByText(/lines parsed/)).toBeVisible();
  });
});