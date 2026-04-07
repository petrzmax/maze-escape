# Maze Escape — Project Guidelines

## Overview

Wolfenstein-style first-person maze game. Vanilla JS + HTML5 Canvas, no build system or dependencies. Served as static files. See [README.md](../README.md) for gameplay details.

## Architecture

| File | Role |
|------|------|
| `game.js` | Entry point — IIFE with game loop (`requestAnimationFrame`), state machine, HUD, fog-of-war |
| `raycaster.js` | `Raycaster` class — Lodev DDA wall-casting, floor/ceiling, sprite rendering, procedural textures |
| `player.js` | `Player` class — WASD/arrow input, movement, SAT collision (AABB-to-circle) |
| `enemy.js` | `Enemy` class — BFS pathfinding (recalculated every 20 frames), waypoint following |
| `audio.js` | `SoundManager` class — all audio synthesized via Web Audio API (no audio files) |
| `maze.js` | `generateMaze()` — recursive backtracker + 30% wall removal for path variety |
| `index.html` | Loads scripts in strict order: maze → raycaster → player → enemy → audio → game |

**No module bundler.** Scripts use IIFEs and ES6 classes exposed as globals. Load order in `index.html` is critical — changing it breaks constructors.

## Code Style

- **Classes:** PascalCase (`Player`, `SoundManager`)
- **Functions:** camelCase (`generateMaze`, `distToPlayer`)
- **Constants:** SCREAMING_SNAKE_CASE (`MAZE_CELLS_W`, `ENEMY_CATCH_DIST`)
- **Private members:** `_` prefix (`_moveWithCollision`, `_recalcPath`)
- **Indentation:** 4 spaces
- **Semicolons:** Always
- **Fast int cast:** `| 0` instead of `Math.floor` in hot paths (raycaster, audio)
- **Angle wrapping:** `((angle % TAU) + TAU) % TAU`

## Conventions

- **No external assets.** Textures are generated procedurally on canvas. Audio is synthesized with Web Audio API oscillators and noise buffers. Keep it dependency-free.
- **Map encoding:** `0` = floor, `1` = wall, `≥2` = special tiles (exit = `2`). Grid is `(2*cellsW+1) × (2*cellsH+1)`.
- **Cell coordinates** use `0.5` offsets for centers (e.g., start at `(1.5, 1.5)`).
- **Proximity triggers** (not collision): win at distance `< 0.8` from exit, enemy catches at `< 0.6`.
- **AudioContext** is lazy-initialized on first user gesture (browser autoplay policy). Always call `soundManager.resume()` before playing.

## Pitfalls

- **Script order matters.** `index.html` loads files sequentially — `game.js` must be last.
- **Raycaster pixel math** uses `ImageData` typed arrays with bitwise ops. Off-by-one errors corrupt the framebuffer.
- **BFS pathfinding** operates on the map grid, not world coordinates. Convert with `Math.floor()`.
- **Fog-of-war minimap** code exists but is partially commented out in `raycaster.js`.
- **Browser requirements:** Canvas 2D, Web Audio API, `requestAnimationFrame`. No polyfills.

## Testing

No test framework. Verify changes by opening `index.html` in a browser. Key scenarios to check:
1. Maze generates with reachable exit
2. Player collision prevents walking through walls
3. Enemy pathfinds and catches player
4. Win condition triggers at exit
5. Audio plays without errors (check console for AudioContext warnings)
