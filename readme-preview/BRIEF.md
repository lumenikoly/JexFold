---
workflow: motion-graphics
flow: automation
storyboard: no
message: 'JexFold converts JPEGs to JXL reversibly and verifies byte-for-byte restoration.'
destination: README preview
aspect: landscape
language: en
length: 7s
fps: 15
audio: none
output: looping GIF and MP4
---

## Intent

Compact product UI preview for a GitHub README. Reconstruct the real JexFold interface from `src/App.tsx` and `src/styles.css`: full-bleed app shell, header, page heading, mode bar, dropzone, settings, source queue, progress panel, and footer. The conversion queue is the proof: files enter naturally, progress runs linearly, and the verification result is the visual payoff.

## Visual direction

Faithful to the real product UI rather than a fabricated shell: light warm background treatment, compact density, rounded panels, thin separators, no outer frame, no side rail, no browser chrome, no cursor, no narration, no audio, and no decorative dashboard elements. Reuse JexFold tokens from `src/styles.css`: warm paper, navy ink, peach accent, muted text, and green success.

## Sequence

- 0.0–0.8: Real empty state with JexFold mark/name, “Convert JPEG to JXL”, mode switcher, and the centered “Drop files here” / “or choose files from your computer” dropzone.
- 0.8–1.8: Four JPEGs settle into a compact queue.
- 1.8–2.2: “Convert to JXL” becomes a progress action.
- 2.2–4.8: Linear conversion progress, row states Encoding… → Verifying… → ✓, aggregate 184 MB → 147 MB, and a small jackal silhouette traveling on the progress rail.
- 4.8–6.2: Completion proof: Saved 37 MB · 20.1%, ✓ 24 files verified, 0 failed.
- 6.2–7.0: Fade back to the exact opening state for a clean loop.
