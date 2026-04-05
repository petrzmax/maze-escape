/**
 * Maze generation using recursive backtracker + wall removal for multiple paths.
 * Logical grid: cellsW x cellsH cells.
 * Actual map array: (2*cellsW+1) x (2*cellsH+1) where 1=wall, 0=floor, 2=exit.
 */
function generateMaze(cellsW, cellsH) {
    const mapW = cellsW * 2 + 1;
    const mapH = cellsH * 2 + 1;

    // Initialize map: all walls
    const map = [];
    for (let y = 0; y < mapH; y++) {
        map[y] = [];
        for (let x = 0; x < mapW; x++) {
            map[y][x] = 1;
        }
    }

    // Visited array for cells
    const visited = [];
    for (let y = 0; y < cellsH; y++) {
        visited[y] = [];
        for (let x = 0; x < cellsW; x++) {
            visited[y][x] = false;
        }
    }

    function cellToMap(cx, cy) {
        return { x: cx * 2 + 1, y: cy * 2 + 1 };
    }

    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];

    // Step 1: Recursive backtracker to carve base perfect maze
    const stack = [];
    visited[0][0] = true;
    const startMap = cellToMap(0, 0);
    map[startMap.y][startMap.x] = 0;
    stack.push({ cx: 0, cy: 0 });

    while (stack.length > 0) {
        const { cx, cy } = stack[stack.length - 1];
        const neighbors = [];
        for (const [dx, dy] of dirs) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && nx < cellsW && ny >= 0 && ny < cellsH && !visited[ny][nx]) {
                neighbors.push({ nx, ny, dx, dy });
            }
        }
        if (neighbors.length === 0) { stack.pop(); continue; }

        const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
        const { nx, ny, dx, dy } = chosen;

        // Carve wall between and neighbor cell
        map[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = 0;
        const nm = cellToMap(nx, ny);
        map[nm.y][nm.x] = 0;

        visited[ny][nx] = true;
        stack.push({ cx: nx, cy: ny });
    }

    // Step 2: Remove extra walls to create loops (multiple paths)
    // Remove ~30% of interior walls that separate two floor cells
    const wallCandidates = [];
    for (let y = 1; y < mapH - 1; y++) {
        for (let x = 1; x < mapW - 1; x++) {
            if (map[y][x] !== 1) continue;
            // Check if this wall separates two floor cells horizontally or vertically
            if (x % 2 === 0 && y % 2 === 1) {
                // Vertical wall between (x-1,y) and (x+1,y)
                if (map[y][x - 1] === 0 && map[y][x + 1] === 0) {
                    wallCandidates.push({ x, y });
                }
            }
            if (x % 2 === 1 && y % 2 === 0) {
                // Horizontal wall between (x,y-1) and (x,y+1)
                if (map[y - 1][x] === 0 && map[y + 1][x] === 0) {
                    wallCandidates.push({ x, y });
                }
            }
        }
    }

    // Shuffle and remove ~30%
    for (let i = wallCandidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wallCandidates[i], wallCandidates[j]] = [wallCandidates[j], wallCandidates[i]];
    }
    const removeCount = Math.floor(wallCandidates.length * 0.3);
    for (let i = 0; i < removeCount; i++) {
        const { x, y } = wallCandidates[i];
        map[y][x] = 0;
    }

    // Start and exit positions
    const start = { x: 1.5, y: 1.5 };

    const exitCellX = cellsW - 1;
    const exitCellY = cellsH - 1;
    const exitMap = cellToMap(exitCellX, exitCellY);
    const exit = { x: exitMap.x + 0.5, y: exitMap.y + 0.5 };

    // Mark exit cell
    map[exitMap.y][exitMap.x] = 2;
    if (exitMap.y + 1 < mapH) map[exitMap.y + 1][exitMap.x] = 2;

    return { map, mapW, mapH, start, exit };
}
