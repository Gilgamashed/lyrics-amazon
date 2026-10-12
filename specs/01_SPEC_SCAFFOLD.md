# 01_SPEC_SCAFFOLD.md — Phase 1: Project Scaffolding

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Phase:** 1 of 7 (see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD`)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Establish the runnable, layered, and versioned foundation for the Lyrics for Amazon Music app: a Vite + React 19 + TypeScript + Tailwind CSS scaffold with a layered `src/` structure (types / services / components), a window-manager skeleton, and baseline documentation — so every subsequent phase builds on a verified base.

## 2. Context

This is Phase 1 of the 7-phase roadmap described in `specs/PROJECT_OVERVIEW.MD` (§5). Development follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

**Current status (gap-closure note):** The repository already contains most of the scaffold:

- ✅ Vite + React + TypeScript + Tailwind 4 tooling (`package.json`, `vite.config.ts`, `tsconfig.json`, `src/index.css`).
- ✅ Layered `src/` structure: `src/types/lyrics.ts` (domain types), `src/services/` (data providers), `src/components/` (UI).
- ✅ Window-manager skeleton with drag/resize foundations (`src/components/FloatingLyricsWindow.tsx`).
- ✅ `.gitignore` excluding `node_modules/`, `dist/`, `build/`, `coverage/`, `.env*`.

**Missing / to close:**
- ❌ Git repository not yet initialized.
- ❌ Project-specific `README.md` (current one is the generic AI Studio template).
- ❌ `specs/PROMPTS.md` is empty (prompt history not seeded).

Features beyond Phase 1 — the lyric engine (LRCLIB/Genius retrieval, search), the pluggable AI adapter, media-session detection, and the native companion bridge — are explicitly **out of scope** for this phase.

## 3. Tasks and Responsibilities

### 3.1 Documentation & Delivery

| Task | Responsibility |
| :--- | :--- |
| Verify the scaffold runs end-to-end (`npm run dev`). | Delivery |
| Verify `npm run build` and `npm run lint` (`tsc --noEmit`) pass. | Delivery & Quality |
| Confirm the layered `src/` structure (types / services / components) is present and exercised. | Delivery |
| Confirm a window-manager skeleton with drag/resize foundations exists (`src/components/FloatingLyricsWindow.tsx`), without requiring a rewrite. | Delivery |
| Initialize the git repository and make an initial commit (README + specs included). | Delivery & Documentation |
| Replace the generic AI Studio `README.md` with a project-specific one: what the app is, prerequisites (Node.js), setup, and run commands. | Documentation |
| Seed `specs/PROMPTS.md` with the project's prompt/decision history (currently empty). | Documentation |
| Keep `specs/PROJECT_OVERVIEW.MD` and this spec consistent with the implemented state. | Documentation |

### 3.2 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| Do not implement Phase 2–6 features (lyric fetching/search, AI adapter, media-session, native companion). | Code Safety (per `00_AI-SAFE.md`) |
| Do not add unnecessary dependencies. | Quality |
| Keep typecheck/lint clean (`npm run lint`). | Quality |
| Do not commit secrets; `.env*` remains ignored, referenced only via `.env.example`. | Code Safety |

## 4. Definition of Done

- [ ] `npm run dev` boots the app locally without errors.
- [ ] `npm run build` completes successfully.
- [ ] `npm run lint` (`tsc --noEmit`) passes with no errors.
- [ ] Layered `src/` structure (types / services / components) is present and used by the app.
- [ ] Window-manager skeleton (`src/components/FloatingLyricsWindow.tsx`) exists with drag/resize foundations.
- [ ] Git repository initialized with an initial commit including the specs and README.
- [ ] `README.md` documents the app, prerequisites, setup, and run commands.
- [ ] `specs/PROMPTS.md` is seeded with the project prompt history.
- [ ] `.gitignore` excludes `node_modules/`, `dist/`, `.env*`; no secrets present in tracked files.
- [ ] No Phase 2–6 features were introduced during this phase.