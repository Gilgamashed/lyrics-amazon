# PROMPTS.md — AI Prompt & Decision History

## How to fill this file

- **Purpose:** Chronologically record every AI prompt/decision that changed the project (required by SpecDD and DoD #8 of `01_SPEC_SCAFFOLD.md`).
- **When to add:** After each accepted AI-assisted decision or spec step (e.g., a spec is drafted or revised, or code is generated).

### Fields

| Field | What to write |
| :--- | :--- |
| `**Tool:**` | AI tool + model used (e.g., Gemini, Claude, Copilot). |
| `**Context:**` | Which spec/task motivated the change (reference the spec file). |
| `**Prompt:**` | What was asked. |
| `**Result:**` | What was generated, or why it was rejected. |
| `**Human Review:**` | What the human team validated/changed. |

### Rules

- Append entries chronologically (newest at the bottom), each titled with the `[AAAA-MM-DD]` date prefix.
- Always reference the relevant spec file (e.g., `specs/0N_SPEC_*.md`).
- Keep entries factual and concise; include code only where it illustrates the decision.

---

## EXAMPLE

```markdown
## [AAAA-MM-DD] Short Title

- **Tool:** <Tool name/model>
- **Context:** <Which spec/task motivated change>
- **Prompt:** <What was asked>
- **Result:** <What was generated, or why was it rejected>
- **Human Review:** <What was validated/changed by the human team>
```

---

## History

## [2026-10-11] Create project overview for lyrics-for-amazon

- **Tool:** OpenAI Codex
- **Context:** Replace the SynapseShop template in `specs/PROJECT_OVERVIEW.MD` with an overview of the Lyrics for Amazon Music project per the 7-phase roadmap.
- **Prompt:** "Based on specs/PROJECT_OVERVIEW.MD create a new PROJECT_OVERVIEW.MD file containing info pertaining to the lyrics-for-amazon project..."
- **Result:** New `specs/PROJECT_OVERVIEW.MD` (English, 6-layer architecture, 7-phase roadmap, provider-agnostic AI placeholder, native companion bridge for desktop-app detection).
- **Human Review:** Approved two decisions: provider-agnostic AI fallback adapter; native companion bridge (SMTC/MediaRemote/MPRIS) for desktop-app track detection.

## [2026-10-11] Adapt AI-SAFE guideline to the lyrics project

- **Tool:** OpenAI Codex
- **Context:** `specs/00_AI-SAFE.md` still referenced the unrelated "PoggingTime" project.
- **Prompt:** "Let's edit the specs/00_AI-SAFE.md to adapt to the realities of our lyrics project too."
- **Result:** Rewrote §1–§3 to reference Lyrics for Amazon Music, `specs/PROJECT_OVERVIEW.MD`, the 7-phase roadmap, the `NN_SPEC_NAME.md` file convention, and updated Anticipation-Ban examples.
- **Human Review:** Approved; confirmed naming convention `NN_SPEC_NAME.md`.

## [2026-10-11] Draft Phase 1 scaffold spec

- **Tool:** OpenAI Codex
- **Context:** Begin SpecDD execution with Phase 1 (scaffolding) of the roadmap.
- **Prompt:** "Create a 01_SPEC_SCAFFOLD.md file that focuses on phase 1... sections: Objective, Context, Tasks and Responsibilities, and a Definition of Done."
- **Result:** Created `specs/01_SPEC_SCAFFOLD.md` with gap-closure framing (repo already exceeded a pure scaffold).
- **Human Review:** Approved the "Spec + gap-closure" framing over greenfield-only.

## [2026-10-11] Add PROMPTS.md fill instructions

- **Tool:** OpenAI Codex
- **Context:** `specs/PROMPTS.md` contained only an EXAMPLE template; DoD #8 requires a seeded prompt history.
- **Prompt:** "Let's add instructions on how to fill the PROMPT.md - follow the example found in the file itself."
- **Result:** Added "How to fill this file" section (purpose, fields table, chronological rules), fixed typos, and seeded the history with decisions recorded so far.
- **Human Review:** Approved chronological (append) ordering and typo fixes.

## [2026-10-12] Draft Phase 2 lyric engine spec

- **Tool:** OpenAI Codex
- **Context:** Continue SpecDD execution with Phase 2 (core lyric engine) of the roadmap.
- **Prompt:** "Let's create a 02_SPEC_SCAFFOLD.md file that focuses on phase 2 of the PROJECT_OVERVIEW.MD, following the same pattern as the 01_SPEC_SCAFFOLD.md."
- **Result:** Created `specs/02_SPEC_LYRIC_ENGINE.md` (Objective, Context with gap-closure, Tasks & Responsibilities, DoD); renamed to `02_SPEC_LYRIC_ENGINE.md` to match the roadmap area.
- **Human Review:** Confirmed filename `02_SPEC_LYRIC_ENGINE.md`; DoD audit marked all items done via code inspection + lint.

## [2026-10-12] Add in-memory cache and smoke verification for the lyric engine

- **Tool:** OpenAI Codex
- **Context:** Phase 2 (`specs/02_SPEC_LYRIC_ENGINE.md`) DoD review; user proposed caching recently played song data and running runtime smoke-verification with/without cache.
- **Prompt:** "I'm considering adding a cache for recently played song data and run runtime smoke-verification with and without cache, documenting the finding in the README.md. How should we approach this?"
- **Result:** Added `src/services/lyricsCache.ts` (memory-only, bounded 20 entries, 7-day TTL, `title|artist` key, `useCache` bypass in `fetchLyrics`), `scripts/smoke-lyrics.ts` (`npm run smoke`), README "Lyrics Cache" + "Runtime Smoke-Verification" sections with measured timings, and updated the Phase 2 spec DoD.
- **Human Review:** Approved scope (lyrics-only), persistence (memory-only), and live smoke run. Live result: cache hit 0 ms vs 400 ms cold fetch.

## [2026-10-12] Draft Phase 3 floating window spec

- **Tool:** OpenAI Codex
- **Context:** Continue SpecDD execution with Phase 3 (floating window UX) of the roadmap.
- **Prompt:** "Let's create a 03_SPEC_UX.md file that focuses on phase 3 of the PROJECT_OVERVIEW.MD, following the same pattern as the 01_SPEC_SCAFFOLD.md." — then "Let's proceed using the 03_SPEC_FLOATING_WINDOW.md file name."
- **Result:** Created `specs/03_SPEC_FLOATING_WINDOW.md` (Objective, Context with gap-closure, Tasks & Responsibilities, DoD) covering drag/resize glass window, opacity/blur/pin/minimize/presets, karaoke and full-sheet modes, and the Genius annotations drawer.
- **Human Review:** Chose filename `03_SPEC_FLOATING_WINDOW.md` (per `00_AI-SAFE.md` example); approved gap-closure framing with all DoD items checked.

## [2026-10-12] Draft Phase 4 playback sync spec

- **Tool:** OpenAI Codex
- **Context:** Continue SpecDD execution with Phase 4 (playback sync) of the roadmap.
- **Prompt:** "Now, let's create a 04_SPEC_LYRICSYNC.md file that focuses on phase 4 of the PROJECT_OVERVIEW.MD, following the same pattern as the 01_SPEC_SCAFFOLD.md."
- **Result:** Created `specs/04_SPEC_LYRICSYNC.md` (Objective, Context with gap-closure, Tasks & Responsibilities, DoD) covering the playback timer, media-session integration (metadata + play/pause/seekto), and `±0.5s`/`±0.1s` offset calibration.
- **Human Review:** Confirmed filename `04_SPEC_LYRICSYNC.md`; approved gap-closure framing with all DoD items checked.

## [2026-10-12] Draft Phase 5 AI fallback spec

- **Tool:** OpenAI Codex
- **Context:** Continue SpecDD execution with Phase 5 (customizable AI fallback) of the roadmap.
- **Prompt:** "Now, let's create a 05_SPEC_AIFALLBACK.md file that focuses on phase 5 of the PROJECT_OVERVIEW.MD, following the same pattern as the 01_SPEC_SCAFFOLD.md" — plus two personal additions: (1) users input their own API keys in an options menu; (2) AI-generated lyrics saved locally permanently.
- **Result:** Created `specs/05_SPEC_AIFALLBACK.md` (Objective, Context, Tasks & Responsibilities, DoD, Deferred/TODO), framed as forward-looking (unchecked DoD) since Phase 5 is not yet implemented.
- **Human Review:** Chose direct browser fetch (no proxy); session-only API key with a deferred TODO to research more secure handling; AI-only localStorage persistence (no TTL).

## [2026-10-12] Implement Phase 5 AI fallback

- **Tool:** OpenAI Codex
- **Context:** Execute the `specs/05_SPEC_AIFALLBACK.md` DoD; the spec was amended first to reflect the key-security decision.
- **Prompt:** "let's execute" (following the agreed plan of action: amend spec, foundations, AI services, integration, UI, docs).
- **Result:** Added `AIConfig` type; `src/services/aiService.ts` (`resolveAIConfig` + `synthesizeLyrics` over an OpenAI-compatible `chat/completions` endpoint); `src/services/aiLyricsStore.ts` (permanent, AI-only `localStorage`); integrated AI into the `fetchLyrics` cascade (curated → LRCLIB → AI-store → AI-call → canned); new `src/components/OptionsMenu.tsx` (masked, session-only key) wired into `AmazonMusicBar` and `App`; updated `.env.example` (endpoint/model only) and README. All DoD items checked.
- **Human Review:** Env carries only non-secret endpoint/model; the API key is entered at runtime and never bundled — server-side proxy remains the documented secure alternative (deferred). `npm run lint` and `npm run build` pass.

## [2026-10-12] Draft Phase 6 native companion bridge spec

- **Tool:** OpenAI Codex
- **Context:** Continue SpecDD execution with Phase 6 (native companion bridge / desktop-app track detection) of the roadmap.
- **Prompt:** "Now, let's create a 06_SPEC_DETECTION.md file that focuses on phase 6 of the PROJECT_OVERVIEW.MD, following the same pattern as the 01_SPEC_SCAFFOLD.md."
- **Result:** Created `specs/06_SPEC_DETECTION.md` (Objective, Context, Tasks & Responsibilities, DoD, Deferred/TODO), framed as forward-looking (unchecked DoD) since Phase 6 is not implemented.
- **Human Review:** Chose Tauri v2 shell with a Rust-native bridge in the Tauri core; localhost WebSocket + HTTP transport; Windows-first (SMTC) with macOS/Linux adapters; full cross-platform validation deferred to Phase 7.

## [2026-10-12] Phase 6 toolchain decision and Rust setup

- **Tool:** opencode (big-pickle)
- **Context:** `specs/06_SPEC_DETECTION.md` requires a Rust/Tauri build; no Rust toolchain was installed.
- **Prompt:** "let's proceed" (plan Part 0: environment setup).
- **Result:** `winget` hung, so `rustup-init.exe` was downloaded directly from `win.rustup.rs` and installed stable 1.99.0 (MSVC). A throwaway crate plus the full Tauri dependency tree compiled and linked against the existing **VS2017 MSVC 14.16 + Windows SDK 10.0.26100**, so no VS2022 Build Tools install was needed.
- **Human Review:** Confirmed VS2017-first decision held; fallback (VS2022 Build Tools) remains documented but unused.

## [2026-10-12] Implement Phase 6 native companion bridge

- **Tool:** opencode (big-pickle)
- **Context:** Execute the `specs/06_SPEC_DETECTION.md` DoD (all tasks in §3).
- **Prompt:** "let's proceed" (approved plan: Tauri scaffold → Rust bridge → frontend integration → docs/verification).
- **Result:** Added `@tauri-apps/cli`/`@tauri-apps/api` ^2 and a Tauri v2 scaffold (`src-tauri/`, identifier `com.lyrics.amazonmusic`, devUrl `http://localhost:3000`). Rust bridge in `src-tauri/src/bridge/`: `NowPlaying` schema (camelCase JSON), `NowPlayingSource` common trait, `windows.rs` (SMTC via `windows-rs` 0.62: MTA COM init, 1s poll, thread-parking `block_on` for `IntoFuture` async ops), `macos.rs` (`nowplaying-cli get-raw` JSON), `linux.rs` (`playerctl` MPRIS), and an axum server on `127.0.0.1:48765` (`GET /health`, `GET /now-playing`, `GET /ws` push via broadcast, 1s diff polling). Frontend: `src/services/bridgeService.ts` (WS client with exponential backoff + HTTP snapshot), `App.tsx` desktop-track mapping into `Song`/playback + auto lyrics load, `AmazonMusicBar` Desktop (native) vs Browser (Media Session) indicator, `.env.example` `VITE_BRIDGE_URL`, new `scripts/smoke-bridge.ts` (`npm run bridge:smoke`), Tauri npm scripts, README docs.
- **Human Review:** All 13 DoD items checked. `npm run lint`, `npm run build`, `cargo clippy --all-targets`, `cargo build` pass; live smoke run PASS (bridge detected a real Windows SMTC session over HTTP + WS). No Phase 7 features introduced.