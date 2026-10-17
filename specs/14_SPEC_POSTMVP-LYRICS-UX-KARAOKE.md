# 14_SPEC_POSTMVP-LYRICS-UX-KARAOKE.md — Post-MVP: Lyrics Panel UX, Provider Chain & AI Karaoke Sync

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Track:** Post-MVP (follows `specs/13_SPEC_POSTMVP-LIVE-CORE-PATCH.md`; see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD` §5)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Deliver the **second-round UX and lyrics-sourcing improvements**: make the lyrics surface **always-own its header and scrollbar** (the song-name bar and the Karaoke/Full Sheet tabs stay visible, and both tabs scroll), turn the provider chain **synced-first** by adding the **Lyrica** source and **demoting Genius**, and add the **user-triggered AI karaoke pipeline** that turns a provider's static lyrics into **permanently saved, time-synced lyrics**.

The work is strictly bounded to the **lyrics panel layout/scroll**, the **provider chain and its new source**, and the **AI static→synced pipeline** (loopback capture → hosted alignment → merge → permanent save). It delivers the app at **`0.5.2`**. It does **not** touch detection, the bridge metadata payload, the playback clock, lyrics-load sequencing, or the manual metadata edit (all owned by `13_SPEC_POSTMVP-LIVE-CORE-PATCH.md`).

## 2. Context

This is the **sixth post-MVP spec**, following `specs/13_SPEC_POSTMVP-LIVE-CORE-PATCH.md`. Development follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

### 2.1 Round-2 live-tester feedback (verbatim intent)

Testers re-ran the app after spec 12 and reported the following. The items **owned by this spec** are:

- **The main lyrics window bar containing the song name and the karaoke/full-sheet tabs needs to be fixed and always visible.**
- **The main lyrics box needs a scroll bar for both the karaoke and full sheet tabs.**
- **When the lyrics were provided by Genius, it was often the case that karaoke mode would be unavailable.**
- **More lyrics provider options such as Lyrica API.**
- **Move Genius down the list of providers** (does not natively host time-synced lyrics).
- A system in which users can **turn static lyrics from providers into parsed synced karaoke themselves with AI**, saved permanently:
    1. fetch the unsynced text;
    2. pass the song audio track through an open-source audio-to-text alignment model like Whisper on Hugging Face;
    3. merge the data and save.

The remaining round-2 items — Amazon-only Most Listened, album art, the 3-minute karaoke freeze, repeated/stale lyrics, song-name/artist correctness, unsearched tracks, and the manual metadata fix — are **owned by `13_SPEC_POSTMVP-LIVE-CORE-PATCH.md`** and are out of scope here.

### 2.2 Root-cause analysis (diagnosed against the code)

1. **The panel header can scroll out of view.** Karaoke auto-scroll calls `scrollIntoView({ block: 'center' })` (`src/components/KaraokeLyricsView.tsx:44-51`). `scrollIntoView` scrolls **every** scrollable ancestor, and `overflow: hidden` ancestors (`<main>` at `src/App.tsx:318` and the root shell) are still **script-scrollable** — so on a short window the panel header (title + Karaoke/Full Sheet tabs) is clipped away. Secondary: the header's right control group is `shrink-0` (`src/components/LyricsPanel.tsx:76-171`) and can push the tabs off the panel at narrow widths.
2. **Scrollbars are effectively invisible.** `.custom-scrollbar` draws a **6 px** bar with a **15 %-opacity** thumb (`src/index.css:18-34`), which reads as "no scrollbar" in WebView2 — on **both** tabs (`KaraokeLyricsView.tsx:107`, `FullSheetLyricsView.tsx:115`).
3. **Genius-first starves karaoke.** The chain is `Genius → LRCLIB` (`src/services/providers/chain.ts:8`). Genius returns **plain-only** by design, so whenever LRCLIB misses (a weak `Unknown Artist` query, a duration mismatch, or a `429`), **no synchronized source is ever reached** and Karaoke stays unavailable even though a synced source may exist.
4. **No synced source beyond LRCLIB, and no path from a plain result to a synced one.** There is no second synced provider and no way for a user to convert the static lyrics they *did* get into karaoke timing.

### 2.3 Current status (implemented through spec 12)

- ✅ Docked lyrics surface with a Karaoke/Full Sheet toggle, sync calibration, thumbs feedback, auto-scroll, and an Info drawer (`src/components/LyricsPanel.tsx`).
- ✅ CORS-free egress (`src/services/httpClient.ts` + the host-allow-listed bridge `/fetch` proxy) and the `Genius → LRCLIB` chain.
- ✅ Permanent local stores for user-accepted and AI-generated lyrics (`src/services/userLyricsStore.ts`, `src/services/aiLyricsStore.ts`).
- ⬜ **The lyrics bar is not guaranteed visible** and auto-scroll can move ancestors (defect 1).
- ⬜ **Scrollbars are not usable/visible** on either tab (defect 2).
- ⬜ **Genius is first** despite being plain-only (defect 3).
- ⬜ **No Lyrica provider** and **no AI static→synced path** (defect 4).

### 2.4 Key decisions (accepted for this spec)

- **Container-local auto-scroll:** the karaoke view scrolls its **own** container via `scrollTop` math and **never** calls `scrollIntoView`; ancestors stay put, so the panel header/footer remain pinned. The header layout is made **responsive** so the tabs can never be clipped, at every layout preset and small window sizes.
- **Always-visible scrollbars:** wider, higher-contrast scrollbar styling is applied to **both** lyric containers (Karaoke and Full Sheet), with manual wheel/drag scrolling honored alongside the Auto-Scroll toggle.
- **Synced-first provider chain:** the order becomes **`LRCLIB → Lyrica → Genius`**, then the AI stages. Genius is demoted because it **never hosts native time-synced lyrics** and its page scrape is the heaviest source. The existing **accepted → saved (karaoke AI / AI)** precedence is unchanged.
- **Lyrica provider:** added as a second synced source (candidate deployment: the free, no-key, line-synced-LRC `Wilooper/Lyrica` API — `github.com/Wilooper/Lyrica`). Its exact reachable **public base URL is validated live during implementation**; if no reachable deployment exists, this spec **records the blocker** and does not wire the provider (the remainder of the spec stands).
- **AI karaoke sync (user-triggered, per song):**
    1. reuse the **plain text already fetched** from a provider;
    2. capture the song's audio via **WASAPI loopback** in the Rust bridge while it plays (post-decode system audio — no DRM circumvention; capture is local);
    3. transcribe/align with a **hosted Whisper-class model** (Hugging Face-compatible endpoint; endpoint/model/key configured in a re-surfaced Options **"Karaoke AI"** section);
    4. **merge** the known plain lines with the model timestamps and **save the result permanently** so it **wins future lookups** for that song.
    The audio is sent only to the **user-configured** alignment endpoint, which the UI states; no key or secret is committed.
- **Delivery:** bump the app version **`0.5.1 → 0.5.2`** (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`) and land on `dev`; **no tag, no release, no CI-secret changes**.

**Out of scope for this spec:** detection, the bridge metadata payload (`appId`/`isAmazon`/`albumArt`), the playback clock, lyrics-load sequencing, and the manual metadata-correction control (all owned by `13_SPEC_POSTMVP-LIVE-CORE-PATCH.md`); karaoke/full-sheet rendering semantics; CORS/egress internals beyond the new allow-list host; word-level karaoke rendering; and any release beyond the version bump.

## 3. Tasks and Responsibilities

### 3.1 Lyrics Panel Header Visibility & Responsive Tabs

| Task | Responsibility |
| :--- | :--- |
| Replace the karaoke `scrollIntoView` auto-scroll with **container-local `scrollTop`** math so ancestors (`<main>`, the shell) are never scrolled. | Delivery |
| Keep the panel header/footer **pinned** and ensure the **Karaoke/Full Sheet tabs are always visible** (responsive header: truncate the title first; never clip the tab group) across layout presets and small windows. | Delivery & Quality |
| Add E2E/component tests: auto-scroll does not move ancestors; the tabs remain visible at the compact preset and a small viewport. | Quality |

### 3.2 Always-Visible Scrollbars (both tabs)

| Task | Responsibility |
| :--- | :--- |
| Apply a **wider, higher-contrast** scrollbar style to the Karaoke and Full Sheet containers (visible track + thumb), retaining the `custom-scrollbar` name. | Delivery |
| Verify manual wheel/drag scrolling works on both tabs alongside the Auto-Scroll toggle. | Quality |
| Add tests asserting the containers are scrollable and the scrollbar styling is present. | Quality |

### 3.3 Lyrica Provider

| Task | Responsibility |
| :--- | :--- |
| **Validate a reachable Lyrica public endpoint live** (base URL + plain/synced response shape + rate limits); if none is reachable, record the blocker and stop before wiring. | Delivery & Quality |
| Add `src/services/providers/lyrica.ts` (LRC → `LyricLine[]` via `parseLrc`; per-request timeout/error isolation) behind the egress layer, and add its host to the bridge `/fetch` **allow-list**. | Delivery |
| Extend the provider union (`src/types/lyrics.ts`), the provider-order surface, and the UI provider label; add fixtures + adapter tests. | Delivery & Quality |

### 3.4 Synced-First Provider Chain (Genius demoted)

| Task | Responsibility |
| :--- | :--- |
| Reorder the chain to **`LRCLIB → Lyrica → Genius`** (`src/services/providers/chain.ts`) with per-provider timeouts, preserving the "prefer synced, retain first plain fallback" behavior. | Delivery |
| Update `PROVIDER_ORDER` (`src/App.tsx`), thumbs-down progression, and the provider-union/labels to match; update chain tests and add a regression test that a synced source is reached when one exists. | Delivery & Quality |
| Document the rationale (Genius has no native time-synced lyrics) in the README and this spec. | Documentation |

### 3.5 AI Karaoke Sync (static → synced, saved permanently)

| Task | Responsibility |
| :--- | :--- |
| Add a Rust **WASAPI loopback capture** command to the bridge that records the current playback to a local, temporary audio buffer/file (bounded duration, clean cancel, no DRM handling). | Delivery |
| Add a frontend **alignment service** that (a) sends the captured audio to a **Whisper-class endpoint** (user-configured URL/model/key) and (b) **merges** the model timestamps with the known plain lines into `LyricLine[]`. | Delivery & Quality |
| Persist the merged result in a permanent local store that **wins future lookups** (new `karaokeSyncStore` or an extension of `aiLyricsStore`), with the `AI Sync` provider label. | Delivery & Quality |
| Surface a user-triggered **"Generate Karaoke (AI)"** action when a plain-only result is shown, with progress/cancel/error states and a clear note that audio is sent to the configured endpoint; re-surface a minimal **"Karaoke AI"** section in `OptionsMenu` (endpoint/model/key; session- or locally-stored, never committed). | Delivery |
| Add tests: alignment/merge with fixtures, store precedence (saved synced lyrics beat the chain), and a mocked capture→align→save round-trip; validate the endpoint's payload size/timeout limits during implementation. | Quality |

### 3.6 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| Keep every existing gate green: `npm run lint`, `npm run build`, `npm run test`, `npm run coverage:report` (≥ 85% combined), `cargo fmt --check`, `cargo clippy --all-targets`, `cargo test`, `npm run test:e2e`, `npm run smoke`, `npm run bridge:smoke`. | Quality |
| Keep coverage **≥ 85% global** and **100% of critical utilities** (updated set: the alignment/merge service, the karaoke-sync store precedence, and the reordered provider chain). | Quality |
| Limit changes to the panel header/scroll behavior, scrollbar styling, the provider chain/new provider, and the AI karaoke pipeline — no detection, bridge metadata payload, playback-clock, load-sequencing, or manual-edit changes. | Quality |
| Introduce no secrets: the alignment endpoint/model are non-secret; any key is entered at runtime and never bundled; `.env*` stays ignored; audio capture is local. | Code Safety (per `00_AI-SAFE.md`) |
| **Bump the app version to `0.5.2`** across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` (root package only; `Cargo.lock` regenerates); do **not** tag or publish; do **not** implement the §5 deferred items. | Delivery / Code Safety |
| Keep the README, `specs/PROJECT_OVERVIEW.MD`, `specs/PROMPTS.md`, and this spec consistent with the implemented state. | Documentation |

## 4. Definition of Done

- [ ] Karaoke auto-scroll **never moves ancestors**; the panel header (song name + **Karaoke/Full Sheet tabs**) stays visible at every layout preset and small window sizes.
- [ ] Both the **Karaoke** and **Full Sheet** tabs show an **always-visible scrollbar** and scroll by wheel/drag.
- [ ] The provider chain is **`LRCLIB → Lyrica → Genius`**; Genius no longer precedes a synced source, and a synchronized result is reached whenever one exists.
- [ ] **Lyrica** is validated live and wired through the egress allow-list (or the blocker is explicitly recorded in this spec).
- [ ] A plain-only track can be converted with the user-triggered **AI karaoke** flow (capture → align → merge → save), the saved synced lyrics **play in Karaoke** and **win future lookups**, and they **persist across restarts**.
- [ ] The AI flow clearly states that audio is sent to the configured endpoint; **no key or secret is committed** and capture remains local.
- [ ] New tests cover the header/scroll behavior, the scrollbars, the Lyrica adapter, the reordered chain, the alignment/merge service, and the karaoke-sync store precedence.
- [ ] The reported *"Genius → karaoke unavailable"* issue is closed end-to-end (spec 13 fixes the metadata/lookup half; this spec's reordered chain + Lyrica fix the synced-source half).
- [ ] All existing quality gates pass (lint, build, Vitest, coverage ≥ 85% with 100% of critical files, fmt, clippy, Rust tests, E2E, `smoke`, `bridge:smoke`), with new tests covering the added behavior.
- [ ] No secrets are committed; `specs/PROMPTS.md` records this spec; the README and `specs/PROJECT_OVERVIEW.MD` stay consistent.
- [ ] The app version is bumped to **`0.5.2`**; **no tag or release** was produced and no §5 deferred items were introduced.

## 5. Deferred / TODO

- **Word-level / syllable-level karaoke rendering** (Lyrica can supply word-level timing) — rendering stays line-level for now.
- **Local `whisper.cpp` alignment** (audio never leaves the machine, no key) — the hosted-endpoint path ships first.
- **Automatic AI karaoke generation** without a user trigger — deferred; generation stays explicit and per song.
- **OS-keychain / server-side AI-key storage** — still deferred per `05_SPEC_AIFALLBACK.md` §5.
- **Provider rate-limit policy & cache TTLs** per source — beyond the per-provider timeout/error isolation required here.
- **Packaged-app E2E (`tauri-driver`)** and **visual regression** — still parked (see `08_SPEC_HARDENING.md` §5).
- **Live macOS/Linux validation** of loopback capture — Windows-first; other platforms degrade gracefully.
