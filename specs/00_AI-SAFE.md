# AI-SAFE: Incremental Development Guideline (Scope Restriction)

## 1. Project Golden Rule (Restricted Context)
This repository hosts the development of **Lyrics for Amazon Music**, a standalone companion that retrieves synchronized lyrics and Genius annotations for songs currently playing on Amazon Music and displays them in a floating, translucent, draggable, and resizable glass window[cite: 1]. The complete planning of this software encompasses a detailed 7-phase roadmap[cite: 1].

**ABSOLUTE WARNING FOR AI AGENTS AND DEVELOPERS:** 
Although the total scope of the project (which includes the native companion bridge for desktop-app track detection and the pluggable AI fallback adapter) is already mapped out in the `specs/PROJECT_OVERVIEW.MD`, **development will strictly follow the SpecDD (Specification-Driven Development) methodology in an iterative and incremental manner**[cite: 1]. Each phase of the roadmap is captured in its own dedicated specification file inside `specs/` (e.g., `01_SPEC_SCAFFOLD.md`), and no work happens outside the current spec[cite: 1].

## 2. Anticipation Ban (Anti-Hallucination Rule)
* **Closed Scope:** Each step delivers only a specific, functional part of the system[cite: 1]. It is strictly forbidden to attempt to implement, suggest, import libraries, or generate code for features that are not explicitly declared in the current step's SpecDD[cite: 1].
* **No Context Leakage:** If the active spec is for Phase 1 (Project Scaffolding), do not build the floating-window presets (Phase 3), do not wire the pluggable AI adapter (Phase 5), and do not add the native companion bridge for desktop-app detection (Phase 6)[cite: 1]. Even when the underlying provider (Genius, LRCLIB, AI adapter) is the same, only the surface area declared in the current spec is in scope[cite: 1].
* **Strict Resolution:** Any generative AI tool reading this repository must limit its response and code generation solely and exclusively to the "Definition of Done" of the provided Specification (SpecDD) document at that moment[cite: 1].

## 3. Workflow
1. The developer will provide the current spec (e.g., `specs/03_SPEC_FLOATING_WINDOW.md`)[cite: 1].
2. The implementation must satisfy **only** the requirements of that specific spec[cite: 1].
3. The code must not contain anxious *placeholders* or infrastructure configurations that will only be used in future steps[cite: 1].