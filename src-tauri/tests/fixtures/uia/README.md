# UIA fixtures (spec 18, W0)

These fixtures were captured with the read-only probe in
`src-tauri/examples/uia_probe.rs` against the live Windows Amazon Music app
(1280×800, process `Amazon Music.exe`) on 2026-10-28. Raw captures stay under
`test-results/uia/`; only the sanitized player-region slices are committed.

## Key findings

1. **`RawViewWalker` is not a reliable primary traversal.** On the same live
   window it exposed only 12–43 elements, even while a track was playing.
   `FindAll(TreeScope_Descendants, TrueCondition)` exposed **365–578** elements
   and the actual player-bar title and artist. `ControlType` conditions were not
   required; the true condition worked.
2. **The live player bar is reachable through `FindAll`.** The elapsed-time
   text is a separate text node above the transport container
   (`transportContainer`, top ~712). The current title and artist are links
   inside the transport region; the title link is at `top ≈ 720`, the artist at
   `top ≈ 742`.
3. **The tree can include overlapping page content.** A player-region capture
   also contained a `REDISCOVER …` page link with the same `top` as the artist.
   Candidate scoring must restrict candidates to the transport container and
   prefer title/artist roles, not just proximity.
4. **The tree is transient.** Repeated captures varied between 25 and 43 nodes
   for `RawViewWalker`, and between 365 and 578 for `FindAll`. The title node
   was missing from several sparse captures. The worker must retry and/or wait
   for a stable candidate.
5. **Minimized windows can still expose player data through `FindAll`,** but
   with off-screen bounds (`-32000`) and no reliable clock/title. The reader
   should treat that state as sparse for candidate selection where appropriate.
6. **Paused playback has a static clock.** The paused fixture is intentionally
   the same structure with a static elapsed time. The reader must not require a
   progressing clock when SMTC says playback is paused.

## Fixtures

| File | Provenance | Notes |
| :--- | :--- | :--- |
| `player-playing.json` | Live `FindAll` capture while playing | Track `Killing In the Name [Explicit]` / `Rage Against The Machine`, elapsed `01:14`; page content removed. |
| `player-paused.json` | Live `FindAll` capture after pausing | Same track, static `01:14`; exercises the no-progression rule. |
| `player-nonlatin.json` | Synthetic text over the live player slice | Japanese title/artist (東京事変 / 椎名林檎); structure and bounds are real. |
| `player-duplicate.json` | Synthetic duplicate of the live player slice | Upper bar has a stale `00:20` clock and a different track; lower bar has the live `01:14` clock. A reader must select the bar consistent with the SMTC position. |
| `player-sparse.json` | Live minimized `FindAll` capture, projected to window/document/transport nodes | Transport container present but no elapsed-time or title/artist nodes; must report a sparse tree and keep SMTC unchanged. |

`title`/`album`/`artist` changes are **SMTC-side** conditions, not different UIA
trees. The missing-title, `title == artist`, album-in-title and unknown-artist
scenarios should be composed in tests from `player-playing.json` plus synthetic
SMTC metadata.

## Sanitization

- Removed all page content, recommendation cards, library names and unrelated
  links.
- Kept only the window/document/transport container, elapsed-time anchor,
  title link, artist link, `LETRAS` and `ULTRA HD` badges.
- Process path is reduced to `Amazon Music.exe`; no user profile path is stored.
- The duplicate and non-Latin fixtures use the real structure with synthetic
  text where noted.

## Reproducing

```bash
cd src-tauri
cargo run --example uia_probe -- --pid <amazon-pid> --mode find-all \
  --out ../test-results/uia/capture.json
cargo run --example uia_probe -- --pid <amazon-pid> --mode walk \
  --out ../test-results/uia/walk.json
```

The probe never invokes controls, changes playback, or writes to the app. It
only reads UIA properties and bounding rectangles.
