# 10_SPEC_POSTMVP-MIN-PATCH.md — Post-MVP: Lyrics Fallback & UX Minor Patch

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Track:** Post-MVP (follows `specs/09_SPEC_POSTMVP-APP-PACK.md`; see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD` §5)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Deliver a small post-MVP **minor patch** to the shipped app that makes the lyrics pipeline more truthful and the playback source smarter, adding four focused improvements:

1. **Truthful lyrics** — a real **Genius** source, and a genuine **"Lyrics not found"** state shown in the lyrics window when the whole provider chain comes up empty (instead of fabricating sample lyrics).
2. **Multi-provider lyrics chain** — look up lyrics across several sources (**Genius, LRCLIB, azlyrics, letras.mus.br, musixmatch**) **before** the AI fallback, rendering plain-only results as the **Full Sheet** when synchronized (karaoke) timing is unavailable.
3. **Amazon Music prioritization** — automatically prefer the **Amazon Music** app's playback when other media apps (YouTube, TikTok, etc.) are also running.
4. **Per-song lyric feedback** — a **thumbs up / thumbs down** control for a song's lyrics: **thumbs up** saves the result locally, **thumbs down** re-searches the next provider.

This patch **does not change the app version and does not produce a release** — it lands on the `dev` branch only.

## 2. Context

This is the **second post-MVP spec**, following `specs/09_SPEC_POSTMVP-APP-PACK.md` (packaging + auto-update for live testing). The 8-phase MVP is complete (`specs/PROJECT_OVERVIEW.MD` §4/§5) and work continues on the post-MVP backlog. Development follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

**Current status (implemented through the post-MVP packaging spec 09):**

- ✅ **Lyrics engine** (`src/services/lyricsService.ts`): curated local database → live **LRCLIB** (`lrclib.net/api/get`, synced LRC or plain) → permanently stored AI lyrics (`src/services/aiLyricsStore.ts`, `localStorage`) → provider-agnostic **AI fallback** (`src/services/aiService.ts`) → a canned **`createFallbackLyrics()`** (lyricsService.ts:265) that *fabricates* sample lyrics for any unmatched track, so the UI never reports "not found".
- ✅ **In-memory lyrics cache** (`src/services/lyricsCache.ts`, 20 entries / 7-day TTL) and a display `provider` label rendered in the window status bar (`FloatingLyricsWindow.tsx:508`); the `provider` union is `'Genius' | 'LRCLIB' | 'Amazon Music' | 'AI Sync'` (`src/types/lyrics.ts:41`).
- ✅ **Native companion bridge** (Tauri/Rust) on `127.0.0.1:48765` publishing a single now-playing snapshot; on Windows it reads `GetCurrentSession()` (`src-tauri/src/bridge/source/windows.rs:38`) — whichever session System Media Transport Controls considers *current* — with macOS/Linux adapters behind the same `NowPlayingSource` trait (`source/mod.rs:26`).
- ✅ **Detection switch** (`src/App.tsx:189`): when the bridge is connected, detection is `desktop`; otherwise `browser` Media Session. The desktop handler consumes whatever single track the bridge publishes (no source preference).
- ✅ **Display modes**: synchronized **Karaoke** (`KaraokeLyricsView.tsx`) and **Full Sheet** (`FullSheetLyricsView.tsx`), with only a "Retrieving synchronized lyrics…" placeholder when a line set is empty (`KaraokeLyricsView.tsx:80`) — never a "not found" message.
- ⬜ **No live Genius source**; "Genius" is only a *label* reused for LRCLIB plain lyrics and the fabricated fallback.
- ⬜ **LRCLIB is the only network lyrics provider** — no azlyrics, letras.mus.br, or musixmatch.
- ⬜ **No Amazon Music session preference** — a concurrent YouTube/TikTok/other SMTC session can win `GetCurrentSession()`.
- ⬜ **No thumbs up/down** on lyrics; existing persistence is limited to `lyricsCache` (memory) and `aiLyricsStore` (AI results only).

**Key decisions (accepted for this spec):**

- **Genius:** integrate via **Genius's public search endpoint** (no client token required). Genius is the **primary** lyrics/match source.
- **Uniform provider lyric-resolution policy:** each provider retrieves lyrics from the best available source — its **official API when it is key-free and returns lyric text**; otherwise it retrieves the **lyrics from public sources**. This policy applies **to all providers** (so key-gated or lyric-less APIs fall back to public sources rather than blocking).
- **Not-found semantics:** the **"Lyrics not found"** state appears **only when the entire chain** (curated + all providers + AI) yields nothing. The fabricated sample fallback (`createFallbackLyrics`) is removed from the automatic retrieval path.
- **Sync availability:** providers that return **plain lyrics only** render in **Full Sheet** mode (no karaoke timing), per the original request.
- **Amazon Music priority:** **automatic** — when multiple media sessions are playing, prefer Amazon Music; otherwise fall back to the system's current session. **Windows-first** (the live-validated platform), with the macOS/Linux adapters kept structurally consistent.
- **Feedback:** **per-song** thumbs up / thumbs down (not per lyric line). Thumbs up **persists the winning result locally**; thumbs down **advances the chain to the next provider** and re-renders.
- **Delivery:** patch the `dev` branch only — **no version bump, no tag, no release, no CI-secret changes**.

**Out of scope for this spec:** a new release/version or any change to the release pipeline; code signing/notarization; live macOS/Linux hardware validation of the new source-priority logic; the AI API-key security overhaul; telemetry/crash reporting; store distribution; MSI auto-update; and any behavior outside the four improvements above.

## 3. Tasks and Responsibilities

### 3.1 Genius Provider & Genuine "Lyrics Not Found" State

| Task | Responsibility |
| :--- | :--- |
| Add a live **Genius** lyrics source using Genius's **public search endpoint** (no client token); resolve the best-matching song and retrieve its lyrics under the uniform policy (§2). | Delivery |
| Remove the fabricated `createFallbackLyrics()` from the **automatic** retrieval path so the app never invents lyrics for unmatched tracks. | Delivery & Quality |
| Add a distinct **"Lyrics not found"** empty state in the lyrics views (and window header), shown **only when the whole chain** — curated, all providers, and AI — returns nothing; keep the existing "retrieving" placeholder for the in-flight case. | Delivery & Quality |
| Extend the `provider` union (`src/types/lyrics.ts`) with the new source identifiers and keep the window's `Provider:` label accurate. | Quality |

### 3.2 Multi-Provider Lyrics Chain (Before AI)

| Task | Responsibility |
| :--- | :--- |
| Introduce a common **provider interface** (match + retrieve) and an **ordered, configurable chain** that runs **before** the AI fallback: **Genius → LRCLIB → azlyrics → letras.mus.br → musixmatch → AI**. | Delivery |
| Implement the provider adapters under the **uniform lyric-resolution policy**: official key-free lyric APIs where available; otherwise retrieve lyrics from **public sources** — for **all** providers (e.g. musixmatch/azlyrics/letras.mus.br use their public pages when no usable API is configured). | Delivery |
| Make retrieval resilient: per-provider timeout/abort and error isolation, so any provider that is offline, blocked, or unmatched **degrades to the next** in the chain without blocking playback. | Delivery & Quality |
| Preserve sync semantics: providers returning **synchronized** lyrics drive **Karaoke**; **plain-only** results force **Full Sheet** mode for that song. | Delivery & Quality |

### 3.3 Amazon Music Playback Prioritization

| Task | Responsibility |
| :--- | :--- |
| In the Windows SMTC adapter (`src-tauri/src/bridge/source/windows.rs`), enumerate the available sessions and **prefer the Amazon Music session** when one is playing; otherwise fall back to the system's current session. | Delivery |
| Keep the macOS (`macos.rs`) and Linux (`linux.rs`) adapters **structurally consistent** with the same preference, without requiring live validation here (fixture/contract-covered). | Delivery & Quality |
| Surface the chosen playback source through the existing bridge payload so the UI's detection indicator reflects Amazon Music vs. another app. | Delivery |
| Keep the change behavior-neutral when only one session exists (identical to the current bridge). | Quality |

### 3.4 Per-Song Thumbs Up / Thumbs Down

| Task | Responsibility |
| :--- | :--- |
| Add a **per-song** thumbs up / thumbs down control to the lyrics window (near the provider/status area). | Delivery |
| **Thumbs up —** persist the winning lyrics for the song **locally** (reuse the `localStorage` persistence pattern from `aiLyricsStore.ts`), so the accepted result is preferred on later lookups. | Delivery |
| **Thumbs down —** advance the **provider chain to the next source** for the current song and re-render; if the chain is exhausted, fall through to the AI/not-found behavior. | Delivery |
| Make feedback durable across restarts and scoped to the song (title + artist key), with a lightweight way to reset it. | Quality |

### 3.5 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| Keep every existing gate green: `npm run lint`, `npm run build`, `npm run test`, `npm run coverage:report` (≥ 85%), `cargo fmt --check`, `cargo clippy --all-targets`, `cargo test`, `npm run test:e2e`, `npm run smoke`, `npm run bridge:smoke`; add tests for the new provider chain, not-found state, source priority, and feedback persistence. | Quality |
| Limit changes to the four improvements — no changes to floating-window ergonomics, karaoke/full-sheet rendering contracts, sync calibration, or the bridge transport beyond source selection. | Quality |
| Introduce no secrets: any provider keys (if ever configured) come from env/CI only; `.env*` stays ignored; no committed credentials. | Code Safety (per `00_AI-SAFE.md`) |
| Do **not** bump the app version, tag, or publish; do **not** implement the §5 deferred items. | Code Safety |
| Keep the README, `specs/PROJECT_OVERVIEW.MD`, `specs/PROMPTS.md`, and this spec consistent with the implemented state. | Documentation |

## 4. Definition of Done

- [x] A live **Genius** source resolves songs via the public search endpoint and provides lyrics (directly or via public sources) under the uniform policy; the fabricated `createFallbackLyrics()` no longer runs in the automatic path.
- [x] The **"Lyrics not found"** message appears in the lyrics window **only when** the entire chain (curated + all providers + AI) yields nothing.
- [x] Lyrics are looked up across the ordered provider chain **before** the AI fallback (**Genius, LRCLIB, azlyrics, letras.mus.br, musixmatch → AI**), with per-provider timeout/error isolation.
- [x] **Plain-only** provider results render as **Full Sheet** mode; synchronized results drive **Karaoke**.
- [x] When multiple media sessions are playing, the bridge **prefers the Amazon Music** session on Windows (falling back to the current session otherwise); macOS/Linux adapters mirror the structure.
- [x] A **per-song thumbs up/down** control is present; **thumbs up** persists the result locally (survives restart) and **thumbs down** advances to the next provider.
- [x] All existing quality gates pass (lint, build, Vitest, coverage ≥ 85%, fmt, clippy, Rust tests, E2E, `smoke`, `bridge:smoke`), with new tests covering the added behavior.
- [x] No secrets are committed; `specs/PROMPTS.md` records this spec; the README and `specs/PROJECT_OVERVIEW.MD` stay consistent.
- [x] No version bump, tag, or release was produced; no §5 deferred items were introduced.

## 5. Deferred / TODO

- **Provider robustness & ToS:** the public-source retrieval path is **fragile by design** (markup changes, rate limits, and each site's terms of service). Provider-specific hardening, caching, and polite rate limiting are deferred; providers must degrade gracefully when a public source changes or blocks access.
- **Key-gated provider tiers:** where an official API requires a key (e.g. Musixmatch's paid tiers) or does not return lyric text, this spec uses public sources; wiring and evaluating key-gated APIs remains a follow-up.
- **Live macOS/Linux source-priority validation** on physical hardware (real MediaRemote/MPRIS sessions with concurrent players) — CI runners are headless; adapters stay fixture/contract-covered.
- **AI API-key security overhaul** (OS keychain / server-side proxy / encrypted storage) — still deferred per `05_SPEC_AIFALLBACK.md` §5.
- **Broader source discovery** — additional lyrics databases beyond the five here, and user-configurable provider ordering/preferences, are out of scope for this patch.
