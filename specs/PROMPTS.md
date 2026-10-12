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