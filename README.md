# Maze Escape

A Wolfenstein-style first-person maze game built with vanilla JavaScript and HTML5 Canvas.

Navigate a randomly generated labyrinth, avoid the enemy, and find the exit before you get caught.

![Maze Escape](https://img.shields.io/badge/game-browser-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Raycasting renderer** — textured walls, floors, and ceilings using Lodev DDA algorithm
- **Procedural maze generation** — recursive backtracker with extra wall removal for multiple paths
- **Enemy AI** — BFS pathfinding to chase the player through the maze
- **Fog-of-war minimap** — reveals cells as you explore
- **Timer** — tracks your escape time
- **Pause/resume** — press ESC to pause

## Controls

| Key | Action |
|-----|--------|
| `W` / `↑` | Move forward |
| `S` / `↓` | Move backward |
| `A` / `D` | Strafe left / right |
| `←` / `→` | Turn left / right |
| `ESC` | Pause / Resume |

## How It Works

1. A maze is generated using a recursive backtracker algorithm on an 18×18 cell grid
2. The raycaster renders a first-person 3D view using DDA ray-wall intersection
3. An enemy spawns after a short delay and chases the player using BFS pathfinding
4. The player must reach the exit tile (marked on the maze edge) to win

## License

This project is licensed under the [MIT License](LICENSE).
