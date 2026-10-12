# 05_SPEC_AIFALLBACK.md — Phase 5: Customizable AI Fallback

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Phase:** 5 of 8 (see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD`)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Deliver the customizable, provider-agnostic AI fallback: an OpenAI-compatible chat/completions adapter (called directly from the browser) configurable through environment variables (endpoint + model) and an in-app options menu (endpoint, model, and session-only API key), which synthesizes synchronized lyrics and annotations when curated / LRCLIB / Genius coverage is missing — and persists AI-generated results permanently in local storage. No compile-time dependency on any single vendor; Gemini remains an optional adapter, not a requirement.

## 2. Context

This is Phase 5 of the 8-phase roadmap described in `specs/PROJECT_OVERVIEW.MD` (§5: "**Customizable AI placeholder**: provider-agnostic adapter (OpenAI-compatible endpoint, env + in-app config), upgrading the canned fallback into real AI-synthesized synchronized lyrics"). Development follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

**Current status (gap-closure note):** Phase 5 has been implemented. Phase 5 began as a fresh build on the following existing foundations, on which the new AI layer was added:

- `@google/genai` is listed as a dependency but is unused in `src/`; Gemini is an **optional** adapter only (per `PROJECT_OVERVIEW.MD` §3.4/§6).
- `.env.example` defines only `GEMINI_API_KEY` and `APP_URL`; the target variables `VITE_AI_PROVIDER_URL` and `VITE_AI_MODEL` are not yet defined. (The API key is **not** delivered via env — see the security decision below.)
- The provider cascade in `src/services/lyricsService.ts` still ends at the canned `createFallbackLyrics()` (`lyricsService.ts:249`) — there is no AI synthesis step.
- `LyricsData.provider` already includes the `'AI Sync'` value (`src/types/lyrics.ts:41`), reserved for AI-generated results.
- `src/services/lyricsCache.ts` is memory-only (bounded 20 entries, 7-day TTL); there is **no** persistent store.
- There is no options/settings menu (only the window-appearance dropdown in `src/components/FloatingLyricsWindow.tsx`), and no `server.ts` (requests will be issued directly from the browser).

**Personal additions (user-requested for this phase):**

1. **User-supplied API keys** — the options menu must let users enter their own endpoint, model, and API key. The key is held **session-only** (in memory, never persisted, never logged).
2. **Permanent local storage of AI-generated lyrics** — AI-synthesized results are saved **locally and permanently** (no TTL) so repeat plays do not re-invoke the AI provider.

**Key decisions:** provider calls use a **direct browser fetch** to the configured OpenAI-compatible endpoint (no server proxy; a CORS caveat is documented). Environment variables carry only the **non-secret** `VITE_AI_PROVIDER_URL` and `VITE_AI_MODEL`; the API key is **never** put in env or the client bundle (that would expose it to everyone) and is provided solely by the user through the options menu, held **session-only**. Persistence uses **localStorage**, **AI-generated results only**, keyed by `title|artist`. A server-side proxy remains the documented secure alternative for a built-in key (see §5).

**Out of scope for this phase:** the native companion bridge / OS-level desktop-app detection (Phase 6), and audio/multimodal/TTS generation — none may be introduced here per `00_AI-SAFE.md`.

## 3. Tasks and Responsibilities

### 3.1 Documentation & Delivery

| Task | Responsibility |
| :--- | :--- |
| Implement a provider-agnostic AI adapter in `src/services/` over an OpenAI-compatible chat/completions endpoint, called via browser `fetch`. | Delivery |
| Resolve provider configuration in order: in-app session settings → environment (`VITE_AI_PROVIDER_URL`, `VITE_AI_MODEL`) → disabled; the API key always comes from the session settings. | Delivery |
| Add an options/settings menu where the user can enter endpoint, model, and API key (masked input; key held session-only). | Delivery |
| Integrate AI synthesis into the `fetchLyrics` cascade after curated / LRCLIB / Genius coverage, before the canned fallback, returning `provider: 'AI Sync'`. | Delivery & Quality |
| Synthesize timestamped `LyricLine[]` plus Genius-style annotations and trivia consistent with `LyricsData`. | Delivery |
| Persist AI-generated lyrics permanently in `localStorage` (AI-only, keyed `title|artist`, no TTL) and reuse them on repeat plays, with a clear control. | Delivery & Quality |
| Update `.env.example` (and README) to document the AI configuration (endpoint + model only) and the session-only key behavior. | Documentation |
| Keep `specs/PROJECT_OVERVIEW.MD`, `specs/PROMPTS.md`, and this spec consistent with the implemented state. | Documentation |

### 3.2 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| Do not implement Phase 6 features (native companion bridge / desktop-app detection). | Code Safety (per `00_AI-SAFE.md`) |
| Do not add unnecessary dependencies; reuse `fetch` and keep Gemini an optional adapter only. | Quality |
| Keep typecheck/lint clean (`npm run lint`). | Quality |
| Never log or commit API keys; keys stay session-only in memory and `.env*` remains ignored, referenced only via `.env.example`. | Code Safety |
| Fail gracefully on missing config, network errors, timeouts, or malformed responses — fall back to the canned lyrics without blocking playback. | Quality |

## 4. Definition of Done

- [x] A provider-agnostic AI adapter over an OpenAI-compatible chat/completions endpoint exists in `src/services/` and is called via browser `fetch`.
- [x] Provider configuration resolves from in-app session settings, then environment (`VITE_AI_PROVIDER_URL`, `VITE_AI_MODEL`), and can be disabled.
- [x] `.env.example` documents the AI endpoint/model variables, the API key is never placed in env or the client bundle, and Gemini remains an optional adapter rather than a requirement.
- [x] An options/settings menu lets the user enter endpoint, model, and API key (masked input; key held session-only).
- [x] `fetchLyrics` invokes the AI adapter when curated / LRCLIB / Genius coverage is missing and returns `provider: 'AI Sync'` results.
- [x] AI synthesis produces timestamped `LyricLine[]` plus annotations and trivia consistent with `LyricsData`.
- [x] AI-generated lyrics are saved permanently in `localStorage` (AI-only, no TTL), reused on repeat plays, and can be cleared.
- [x] Missing/invalid configuration or network/parse failures fall back gracefully to the canned lyrics without blocking playback.
- [x] The API key is never logged or committed, and remains session-only in memory; `.env*` stays ignored.
- [x] `npm run lint` (`tsc --noEmit`) passes with no errors.
- [x] No Phase 6 features were introduced during this phase.

## 5. Deferred / TODO

- **API-key security:** the session-only, in-memory key handling is an initial, pragmatic choice, and is deliberately the *only* way a key is supplied (no env/bundled key). A follow-up should research more secure alternatives — e.g. an OS keychain, a server-side proxy that keeps keys off the client, or encrypted storage with a passphrase — and adopt one where appropriate. This is explicitly **deferred** and must not be implemented as part of this phase.
