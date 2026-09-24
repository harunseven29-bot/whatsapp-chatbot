---
name: add-game
description: Add a new single-file canvas game to Neon Arcade (games/<id>.html) and register it in the launcher. Use when asked to create, add, or rebuild an arcade game in this repo.
---

# Adding a game to Neon Arcade

Every game is ONE self-contained HTML file in `games/<id>.html`: vanilla JS + `<canvas>`,
no external scripts, fonts, images or network calls. Target size < 45 KB.

## Contract (the launcher and the smoke test depend on this)

1. **Embeddable.** The game runs inside an `<iframe>` in `index.html` and must also work opened
   directly. `html, body` fill the viewport, `overflow: hidden`, no page scroll, no margins.
2. **Responsive canvas.** Use a fixed logical resolution and scale it to fit the viewport
   (letterboxed, aspect preserved, `devicePixelRatio` aware). Must be playable at 360 px width.
3. **Controls.**
   - Keyboard: Arrow keys **and** WASD, `Space` = start / action, `P` = pause, `M` = mute.
     Listen on `window`, `preventDefault()` for arrows and space.
   - Touch: on-screen buttons or swipe gestures (use pointer events). Tap starts the game.
4. **States:** `ready` → `playing` ⇄ `paused` → `over` → (Space/tap) `ready`/`playing`.
   Auto-pause on `visibilitychange` when hidden.
5. **Loop:** `requestAnimationFrame` with a fixed timestep accumulator (e.g. 1/120 s); clamp
   large frame deltas so a background tab does not explode the simulation.
6. **High score:** `localStorage` key `arcade:<id>:best`. Wrap every access in `try/catch`
   and fall back to in-memory values.
7. **Parent notification:** on game over,
   `parent.postMessage({ type: 'arcade-score', game: '<id>', score }, '*')` inside try/catch.
8. **Test hook:** `window.__arcade = { id: '<id>', state: () => ({ status, score }) }` where
   `status` is one of `ready | playing | paused | over`.
9. **Juice:** particles, a little screen shake, short WebAudio beeps (create the
   `AudioContext` lazily on the first user gesture; honour mute).

## Look & language

UI text is **Turkish**. Standard strings: `Skor`, `En Yüksek`, `Başlamak için Boşluk'a bas ya da dokun`,
`Duraklatıldı`, `Oyun Bitti`, `Tekrar için Boşluk / dokun`, `Seviye`, `Can`.

Palette (neon on deep navy):

| token   | value     | use                          |
|---------|-----------|------------------------------|
| bg      | `#0b0f1a` | page + canvas background     |
| panel   | `#121829` | HUD panels, overlays         |
| grid    | `#1c2440` | subtle grid lines            |
| text    | `#e6ecff` | primary text                 |
| muted   | `#8a94b8` | secondary text               |
| cyan    | `#22d3ee` | player / primary accent      |
| magenta | `#f472b6` | enemies / danger             |
| lime    | `#a3e635` | pickups / success            |
| amber   | `#fbbf24` | score / highlights           |
| violet  | `#a78bfa` | extra accent                 |

Use `shadowBlur` glow sparingly (it is expensive). Font: `ui-monospace, SFMono-Regular, Menlo, monospace`
for numbers, `system-ui, sans-serif` for text.

## Register it

Add an entry to the `GAMES` array in `index.html`:

```js
{ id: 'snake', title: 'Yılan', blurb: '…', color: 'var(--lime)', keys: 'Oklar / WASD' }
```

## Verify

```bash
node tools/smoke.mjs            # all games
node tools/smoke.mjs snake      # one game
```

The smoke test loads each game in headless Chromium, fails on any console error or page error,
checks `window.__arcade`, presses Space, holds keys for a while and asserts status becomes
`playing`. A game is not done until it passes.
