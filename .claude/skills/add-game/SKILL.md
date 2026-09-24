---
name: add-game
description: Add a new single-file canvas game to Neon Arcade (games/<id>.html) and register it in the launcher. Use when asked to create, add, or rebuild an arcade game in this repo.
---

# Adding a game to Neon Arcade

Every game is ONE self-contained HTML file in `games/<id>.html`: vanilla JS + `<canvas>`,
no external scripts, fonts, images or network calls. Target size < 90 KB (racing/3D games < 120 KB).

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

## v2 additions (required for every game)

10. **Attract mode.** An AI autopilot that plays the game convincingly (not random input).
    - On the `ready` screen the autopilot plays behind a dimmed overlay with the title and
      "Başlamak için Boşluk'a bas ya da dokun". Starting the game resets to a fresh real game.
    - **Demo mode:** if `location.hash === '#demo'`, the game only runs the autopilot, forever:
      no overlay text except a small game title, no HUD clutter, no audio, no `localStorage`
      writes, no `postMessage`, restarts itself shortly after the autopilot loses, ignores input.
      `__arcade.state().status` is `'demo'`. The launcher shows these as live cabinet previews,
      so it must look great at small sizes (~300×200) and stay cheap (particle caps, no huge
      `shadowBlur`).
11. **Music.** A procedural looping soundtrack via a WebAudio lookahead scheduler (setInterval
    ~25 ms scheduling ~100 ms ahead), with a style fitting the game (bass + arpeggio + drums
    from noise buffers). Plays while `playing`, ducks/stops while paused or over. `M` mutes
    everything, `N` toggles music only. Master gain through a `DynamicsCompressor`.
12. **Pause menu.** `P`/`Escape` or an on-screen ⏸ button opens a menu with clickable and
    keyboard-navigable (↑/↓ + Enter/Space) items: `Devam`, `Yeniden Başla`, `Müzik: Açık/Kapalı`,
    `Ses: Açık/Kapalı`. Esc/P again resumes.
13. **Game-over screen** with stats (at least `Süre` plus 2–3 game-specific stats), the score
    counting up, and a clear "Yeni Rekor!" celebration (confetti/particles) when beaten.
14. **Feel.** Hit-stop / slow-mo on big moments, eased UI transitions, a subtle vignette +
    scanline overlay pre-rendered once to an offscreen canvas. Stable 60 fps at 1280 px;
    avoid per-frame allocations in hot loops and cap particle counts.
15. **Hook extension.** `window.__arcade.state()` may return extra fields, but `status` and
    `score` are mandatory. `window.__arcade.demo` is `true` in demo mode.

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

The smoke test loads each game in headless Chromium at 1280 px and 360 px, fails on any console
error or page error, checks `window.__arcade`, presses Space, holds keys and asserts status becomes
`playing`, checks that `P` pauses, then runs a 5 s soak of random input. It also loads `#demo` and
asserts status `demo` and that the canvas keeps changing. A game is not done until it passes.
