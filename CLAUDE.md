# Neon Arcade

Static, dependency-free browser arcade. No build step.

- `index.html` is the launcher. Its `GAMES` array lists the cabinets; each opens `games/<id>.html` in an iframe.
- `games/*.html` are self-contained canvas games. The contract they follow lives in
  `.claude/skills/add-game/SKILL.md` (controls, states, `window.__arcade` hook, palette, Turkish UI).
- `tools/smoke.mjs` loads every game in headless Chromium and checks the contract. Run it before committing.

## Parallel workflow

Games are independent files, so they are built in parallel: the orchestrator spawns one
`game-builder` subagent (`.claude/agents/game-builder.md`) per game, each following the `add-game`
skill. When they finish, the orchestrator registers the games in `index.html`, runs the smoke test
for everything and commits.
