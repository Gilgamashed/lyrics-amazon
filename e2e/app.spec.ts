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
const LYRICS_STORE_KEY = 'lyrics-amazon:user-accepted-lyrics:v1';

/**
 * Seeds long, evenly spaced synced lyrics as user-accepted results so both
 * lyric surfaces overflow the panel no matter which scripted track the bridge
 * reports or where its clock is. Accepted lyrics win the lookup, so this is
 * deterministic without network or playback timing.
 */
async function seedLongLyrics(page: Page) {
  const make = (title: string, artist: string) => {
    const syncedLyrics = Array.from({ length: 120 }, (_, i) => ({
      id: `l${i}`,
      startTimeMs: i * 2000,
      text: `${title} lyric line ${i + 1}`,
    }));
    return {
      songId: `seed-${title}`,
      title,
      artist,
      album: '',
      albumArt: '',
      provider: 'LRCLIB',
      syncedLyrics,
      plainLyrics: syncedLyrics.map((line) => line.text).join('\n'),
      annotations: [],
    };
  };

  const store = {
    'espresso|sabrina carpenter': make('Espresso', 'Sabrina Carpenter'),
    'cruel summer|taylor swift': make('Cruel Summer', 'Taylor Swift'),
    'city lights|unknown artist': make('City Lights', 'Unknown Artist'),
  };

  await page.addInitScript(
    ([key, payload]: [string, Record<string, unknown>]) => {
      window.localStorage.setItem(key, JSON.stringify(payload));
    },
    [LYRICS_STORE_KEY, store] as [string, Record<string, unknown>]
  );
}

const MANUAL_STORE_KEY = 'lyrics-amazon:manual-lyrics:v1';

/**
 * Seeds the manual-lyrics store so the user's own lyrics win the lookup
 * (spec 19). The keys are the normalized lookup identities of the scripted
 * tracks.
 */
async function seedManualLyrics(page: Page) {
  const make = (title: string, artist: string) => ({
    songId: `manual-${title}`,
    title,
    artist,
    album: '',
    albumArt: '',
    provider: 'Manual',
    syncedLyrics: [
      { id: 'm0', startTimeMs: 1000, text: `${title} manual line` },
    ],
    plainLyrics: `${title} manual line`,
    annotations: [],
    trivia: [],
  });

  const store = {
    'espresso|sabrina carpenter': make('Espresso', 'Sabrina Carpenter'),
    'cruel summer|taylor swift': make('Cruel Summer', 'Taylor Swift'),
    'city lights|unknown artist': make('City Lights', 'Unknown Artist'),
  };

  await page.addInitScript(
    ([key, payload]: [string, Record<string, unknown>]) => {
      window.localStorage.setItem(key, JSON.stringify(payload));
    },
    [MANUAL_STORE_KEY, store] as [string, Record<string, unknown>]
  );
}

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

  test('keeps the panel header and tabs visible while the full sheet scrolls', async ({
    page,
  }) => {
    await seedLongLyrics(page);
    await page.setViewportSize({ width: 360, height: 560 });
    await page.goto('/');

    await expect(trackTitle(page)).toBeVisible({ timeout: 20_000 });
    // The Karaoke/Full Sheet tabs stay reachable at narrow widths.
    await expect(page.getByRole('button', { name: /Karaoke/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Full Sheet' })).toBeVisible();

    await page.getByRole('button', { name: 'Full Sheet' }).click();
    const scroller = page.getByTestId('sheet-scroller');
    const read = () =>
      scroller.evaluate((el) => ({
        top: el.scrollTop,
        client: el.clientHeight,
        scroll: el.scrollHeight,
      }));

    // The sheet owns a bounded, overflowing container (the bug made the panel
    // grow to the full lyric height with no scrollbar at all).
    await expect.poll(async () => (await read()).scroll).toBeGreaterThan((await read()).client);
    await expect.poll(async () => (await read()).client).toBeLessThan(560);

    // A real wheel gesture moves it. Aim at the container's centre rather than
    // using locator.hover(): the bridge can switch tracks mid-test, which
    // detaches and re-creates the scroller while hover is waiting for stability.
    const box = await scroller.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }
    await page.mouse.wheel(0, 600);
    await expect.poll(async () => (await read()).top).toBeGreaterThan(0);

    // The panel header (with the tabs) and its footer stay pinned.
    await expect(page.getByRole('button', { name: 'Full Sheet' })).toBeInViewport();
    await expect(page.getByText(/^Provider:/)).toBeInViewport();
  });

  test('follows the active karaoke line and yields to manual scrolling', async ({ page }) => {
    await seedLongLyrics(page);
    await page.goto('/');
    await expect(trackTitle(page)).toBeVisible({ timeout: 20_000 });

    const scroller = page.getByTestId('karaoke-scroller');
    const activeLineInView = () =>
      scroller.evaluate((el) => {
        const active = el.querySelector('.glow-text');
        if (!active) return false;
        const a = active.getBoundingClientRect();
        const c = el.getBoundingClientRect();
        return a.top >= c.top - 1 && a.bottom <= c.bottom + 1;
      });

    // Auto-follow centers the line that the live playback clock is on.
    await expect.poll(activeLineInView).toBe(true);

    // Playback advances and the current line stays inside the visible area.
    await page.waitForTimeout(1500);
    await expect.poll(activeLineInView).toBe(true);

    // Wheel in whichever direction can actually move, so the input registers.
    const start = await scroller.evaluate((el) => ({
      top: el.scrollTop,
      max: el.scrollHeight - el.clientHeight,
    }));
    await scroller.hover();
    await page.mouse.wheel(0, start.top > start.max / 2 ? -400 : 400);

    // Manual scrolling pauses the follow and reveals the Follow control.
    const follow = page.getByTestId('follow-active-line');
    await expect(follow).toBeVisible();
    const held = await scroller.evaluate((el) => el.scrollTop);
    expect(held).not.toBe(start.top);

    // Seeking elsewhere changes the active line but must not yank the view back.
    const box = (await scroller.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + 40);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(held);
    await expect(follow).toBeVisible();

    // Follow re-centers the current line and clears the control.
    await follow.click();
    await expect(follow).toHaveCount(0);
    await expect.poll(activeLineInView).toBe(true);
  });

  // Spec 17 (W1): the diagnostics terminal records what the app decided.
  test('opens the debug terminal and records the native detection', async ({ page }) => {
    await page.goto('/');
    await expect(trackTitle(page)).toBeVisible({ timeout: 20_000 });

    // Closed by default, opened with Ctrl+Shift+D.
    await expect(page.getByTestId('debug-terminal')).toHaveCount(0);
    await page.keyboard.press('Control+Shift+D');
    const terminal = page.getByTestId('debug-terminal');
    await expect(terminal).toBeVisible();

    // The raw bridge reading and the metadata decision are both recorded.
    await expect(terminal).toContainText('now-playing');
    await expect(terminal).toContainText('reading-accepted');

    // The Options menu offers the same surface.
    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByTestId('debug-terminal')).toHaveCount(0);
    await page.getByRole('button', { name: 'Options' }).click();
    await page.getByTestId('options-open-debug').click();
    await expect(page.getByTestId('debug-terminal')).toBeVisible();
  });

  // Spec 19: the user's own lyrics win the lookup and are labelled Manual.
  test('shows the saved manual lyrics for the detected track', async ({ page }) => {
    await seedManualLyrics(page);
    await page.goto('/');
    await expect(trackTitle(page)).toBeVisible({ timeout: 20_000 });

    await expect(page.getByText('Provider: Manual')).toBeVisible();
    await expect(page.getByTestId('manual-edit')).toContainText('Edit');
    await expect(page.getByTestId('manual-delete')).toBeVisible();
    await expect(page.getByTestId('manual-skip')).toBeVisible();
    await expect(page.getByTestId('thumbs-up')).toBeDisabled();
  });

  // Spec 20: sync mode gets its own surface with no lyrics search.
  test('runs a manual sync session on a dedicated, search-free surface', async ({ page }) => {
    await seedManualLyrics(page);
    await page.goto('/');
    await expect(trackTitle(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Provider: Manual')).toBeVisible();

    await page.getByTestId('manual-sync').click();

    await expect(page.getByTestId('manual-sync-scroller')).toBeVisible();
    await expect(page.getByPlaceholder('Search within lyrics...')).toHaveCount(0);
    await expect(page.getByTestId('manual-sync-line').first()).toHaveAttribute(
      'aria-current',
      'true'
    );
    await expect(page.getByTestId('view-karaoke')).toBeDisabled();
  });
});
