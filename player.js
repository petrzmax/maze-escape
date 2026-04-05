/**
 * Player — position, angle, keyboard input, movement with collision detection.
 */
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.angle = 0; // facing right
        this.radius = 0.2;

        // Movement speeds
        this.moveSpeed = 3.5;   // units per second
        this.rotSpeed = 2.8;    // radians per second
        this.strafeSpeed = 3.0;

        // Input state
        this.keys = {};

        this._onKeyDown = (e) => {
            this.keys[e.code] = true;
            // Prevent arrow keys from scrolling
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
        };
        this._onKeyUp = (e) => {
            this.keys[e.code] = false;
        };
    }

    setupInput() {
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
    }

    removeInput() {
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        this.keys = {};
    }

    update(dt, map, mapW, mapH) {
        const cos = Math.cos(this.angle);
        const sin = Math.sin(this.angle);

        let moveX = 0;
        let moveY = 0;

        // Forward / backward
        if (this.keys['KeyW'] || this.keys['ArrowUp']) {
            moveX += cos * this.moveSpeed * dt;
            moveY += sin * this.moveSpeed * dt;
        }
        if (this.keys['KeyS'] || this.keys['ArrowDown']) {
            moveX -= cos * this.moveSpeed * dt;
            moveY -= sin * this.moveSpeed * dt;
        }

        // Strafe left / right
        if (this.keys['KeyA']) {
            moveX += sin * this.strafeSpeed * dt;
            moveY -= cos * this.strafeSpeed * dt;
        }
        if (this.keys['KeyD']) {
            moveX -= sin * this.strafeSpeed * dt;
            moveY += cos * this.strafeSpeed * dt;
        }

        // Rotation (arrow keys left/right)
        if (this.keys['ArrowLeft']) {
            this.angle -= this.rotSpeed * dt;
        }
        if (this.keys['ArrowRight']) {
            this.angle += this.rotSpeed * dt;
        }

        // Normalize angle
        this.angle = ((this.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

        // Apply movement with collision detection (slide along walls)
        this._moveWithCollision(moveX, moveY, map, mapW, mapH);
    }

    _moveWithCollision(dx, dy, map, mapW, mapH) {
        const r = this.radius;

        // Try X movement
        const newX = this.x + dx;
        if (!this._collidesAt(newX, this.y, r, map, mapW, mapH)) {
            this.x = newX;
        }

        // Try Y movement
        const newY = this.y + dy;
        if (!this._collidesAt(this.x, newY, r, map, mapW, mapH)) {
            this.y = newY;
        }
    }

    _collidesAt(px, py, r, map, mapW, mapH) {
        // Check all grid cells the player's bounding box touches
        const minX = Math.floor(px - r);
        const maxX = Math.floor(px + r);
        const minY = Math.floor(py - r);
        const maxY = Math.floor(py + r);

        for (let gy = minY; gy <= maxY; gy++) {
            for (let gx = minX; gx <= maxX; gx++) {
                if (gx < 0 || gx >= mapW || gy < 0 || gy >= mapH) return true;
                if (map[gy][gx] === 1) {
                    // AABB vs circle collision
                    const closestX = Math.max(gx, Math.min(px, gx + 1));
                    const closestY = Math.max(gy, Math.min(py, gy + 1));
                    const distX = px - closestX;
                    const distY = py - closestY;
                    if (distX * distX + distY * distY < r * r) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
