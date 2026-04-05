/**
 * Enemy — big ball that chases the player using BFS pathfinding.
 */
class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 0.6; // visual size (world units)
        this.collisionRadius = 0.4;
        this.speed = 2.2; // slightly slower than player (3.5)

        // Pathfinding
        this.path = [];
        this.pathIndex = 0;
        this.pathRecalcInterval = 20; // frames between recalculations
        this.pathRecalcCounter = 0;

        // Current movement target (world coords)
        this.targetX = x;
        this.targetY = y;
    }

    update(dt, map, mapW, mapH, playerX, playerY) {
        // Recalculate path periodically
        this.pathRecalcCounter++;
        if (this.pathRecalcCounter >= this.pathRecalcInterval || this.path.length === 0) {
            this.pathRecalcCounter = 0;
            this._recalcPath(map, mapW, mapH, playerX, playerY);
        }

        // Move along path
        if (this.path.length > 0 && this.pathIndex < this.path.length) {
            const target = this.path[this.pathIndex];
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 0.15) {
                // Reached waypoint, move to next
                this.pathIndex++;
            } else {
                // Move toward target
                const step = this.speed * dt;
                if (step >= dist) {
                    this.x = target.x;
                    this.y = target.y;
                } else {
                    this.x += (dx / dist) * step;
                    this.y += (dy / dist) * step;
                }
            }
        }
    }

    distToPlayer(playerX, playerY) {
        const dx = this.x - playerX;
        const dy = this.y - playerY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    _recalcPath(map, mapW, mapH, playerX, playerY) {
        // BFS from enemy grid position to player grid position
        const startGX = Math.floor(this.x);
        const startGY = Math.floor(this.y);
        const endGX = Math.floor(playerX);
        const endGY = Math.floor(playerY);

        // Clamp to map bounds
        if (startGX < 0 || startGX >= mapW || startGY < 0 || startGY >= mapH) return;
        if (endGX < 0 || endGX >= mapW || endGY < 0 || endGY >= mapH) return;

        // BFS
        const visited = new Uint8Array(mapW * mapH);
        const parent = new Int32Array(mapW * mapH).fill(-1);
        const queue = [];

        const startIdx = startGY * mapW + startGX;
        const endIdx = endGY * mapW + endGX;

        visited[startIdx] = 1;
        queue.push(startIdx);

        const dirs = [
            [1, 0], [-1, 0], [0, 1], [0, -1]
        ];

        let found = false;
        let head = 0;

        while (head < queue.length) {
            const idx = queue[head++];
            if (idx === endIdx) {
                found = true;
                break;
            }

            const cx = idx % mapW;
            const cy = Math.floor(idx / mapW);

            for (const [dirX, dirY] of dirs) {
                const nx = cx + dirX;
                const ny = cy + dirY;
                if (nx < 0 || nx >= mapW || ny < 0 || ny >= mapH) continue;

                const nIdx = ny * mapW + nx;
                if (visited[nIdx]) continue;
                // Wall check: value === 1 is impassable wall (0 = floor, 2 = exit floor)
                if (map[ny][nx] === 1) continue;

                visited[nIdx] = 1;
                parent[nIdx] = idx;
                queue.push(nIdx);
            }
        }

        if (!found) {
            this.path = [];
            this.pathIndex = 0;
            return;
        }

        // Reconstruct path
        const rawPath = [];
        let cur = endIdx;
        while (cur !== -1 && cur !== startIdx) {
            const px = cur % mapW;
            const py = Math.floor(cur / mapW);
            rawPath.push({ x: px + 0.5, y: py + 0.5 });
            cur = parent[cur];
        }
        rawPath.reverse();

        this.path = rawPath;
        this.pathIndex = 0;
    }
}
