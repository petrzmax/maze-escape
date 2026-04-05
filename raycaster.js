/**
 * Raycasting renderer — Lodev camera-plane DDA for walls + floors.
 * Uses ImageData buffer for max performance. Consistent math throughout.
 */
class Raycaster {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this._setupResolution();
        this.zBuffer = new Float64Array(this.renderWidth);
        this.wallBottom = new Int32Array(this.renderWidth);
        this.wallTop = new Int32Array(this.renderWidth);
        this.wallTexture = this._generateBrickTexture(64, 64);
        this.wallTextureExit = this._generateExitTexture(64, 64);
        this.floorTexture = this._generateFloorTexture(64, 64);
        this.ceilTexture = this._generateCeilingTexture(64, 64);
        this.imageData = this.ctx.createImageData(this.renderWidth, this.renderHeight);
        this.pixels = this.imageData.data;
        this.minimapCellSize = 2;
        this.minimapPadding = 10;
    }

    _setupResolution() {
        const aspect = window.innerWidth / window.innerHeight;
        const targetPixels = 307200;
        this.renderHeight = Math.floor(Math.sqrt(targetPixels / aspect));
        this.renderWidth = Math.floor(this.renderHeight * aspect);
        this.renderWidth = this.renderWidth & ~1;
        this.renderHeight = this.renderHeight & ~1;
        this.canvas.width = this.renderWidth;
        this.canvas.height = this.renderHeight;
        // Vertical FOV constant at 60°. Horizontal FOV derived from aspect.
        this.vFov = Math.PI / 3;
        this.hHalfFov = Math.atan(aspect * Math.tan(this.vFov / 2));
        // Camera plane magnitude = tan(hHalfFov) for Lodev approach
        this.planeMag = Math.tan(this.hHalfFov);
    }

    resize() {
        this._setupResolution();
        this.zBuffer = new Float64Array(this.renderWidth);
        this.wallBottom = new Int32Array(this.renderWidth);
        this.wallTop = new Int32Array(this.renderWidth);
        this.imageData = this.ctx.createImageData(this.renderWidth, this.renderHeight);
        this.pixels = this.imageData.data;
    }

    // --- Texture generators ---

    _generateBrickTexture(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const x = c.getContext('2d');
        x.fillStyle = '#555555'; x.fillRect(0, 0, w, h);
        const cols = ['#8B4513', '#A0522D', '#7B3F00', '#964B00', '#6B3A2A'];
        for (let row = 0; row < h / 8; row++) {
            const off = (row % 2) * 8;
            for (let col = -1; col < w / 16 + 1; col++) {
                const bx = col * 16 + off + 1, by = row * 8 + 1;
                x.fillStyle = cols[(Math.random() * cols.length) | 0];
                x.fillRect(bx, by, 14, 6);
                for (let i = 0; i < 3; i++) {
                    x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`;
                    x.fillRect(bx + Math.random() * 14, by + Math.random() * 6, 1 + Math.random() * 2, 1 + Math.random() * 2);
                }
            }
        }
        return { data: x.getImageData(0, 0, w, h).data, width: w, height: h };
    }

    _generateExitTexture(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const x = c.getContext('2d');
        x.fillStyle = '#2a4a2a'; x.fillRect(0, 0, w, h);
        const cols = ['#2d7d2d', '#3a8a3a', '#1f6b1f', '#45a045', '#2e722e'];
        for (let row = 0; row < h / 8; row++) {
            const off = (row % 2) * 8;
            for (let col = -1; col < w / 16 + 1; col++) {
                x.fillStyle = cols[(Math.random() * cols.length) | 0];
                x.fillRect(col * 16 + off + 1, row * 8 + 1, 14, 6);
            }
        }
        // Draw EXIT text mirrored so it reads correctly when texture is sampled
        x.save();
        x.translate(w / 2, h / 2);
        x.scale(-1, 1);
        x.fillStyle = '#00ff00'; x.font = 'bold 14px monospace';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText('EXIT', 0, 0);
        x.restore();
        return { data: x.getImageData(0, 0, w, h).data, width: w, height: h };
    }

    _generateFloorTexture(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const x = c.getContext('2d');
        x.fillStyle = '#3a3a3a'; x.fillRect(0, 0, w, h);
        const stoneColors = ['#444', '#3d3d3d', '#484848', '#353535', '#4a4a4a'];
        const stones = [
            [2,2,28,14],[32,2,30,14],[2,18,18,12],[22,18,20,12],[44,18,18,12],
            [2,32,30,14],[34,32,28,14],[2,48,22,14],[26,48,16,14],[44,48,18,14]
        ];
        for (const [sx,sy,sw,sh] of stones) {
            x.fillStyle = stoneColors[(Math.random() * stoneColors.length) | 0];
            x.fillRect(sx, sy, sw, sh);
            x.fillStyle = 'rgba(255,255,255,0.04)';
            x.fillRect(sx, sy, sw, 1); x.fillRect(sx, sy, 1, sh);
            x.fillStyle = 'rgba(0,0,0,0.1)';
            x.fillRect(sx, sy + sh - 1, sw, 1); x.fillRect(sx + sw - 1, sy, 1, sh);
            for (let i = 0; i < 5; i++) {
                x.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.08})`;
                x.fillRect(sx + Math.random() * sw, sy + Math.random() * sh, 1 + Math.random(), 1 + Math.random());
            }
        }
        x.fillStyle = '#2a2a2a';
        x.fillRect(0,0,w,2); x.fillRect(0,16,w,2); x.fillRect(0,30,w,2); x.fillRect(0,46,w,2);
        x.fillRect(0,0,2,h); x.fillRect(30,0,2,18); x.fillRect(20,18,2,14); x.fillRect(42,18,2,14);
        x.fillRect(32,32,2,16); x.fillRect(24,48,2,16); x.fillRect(42,48,2,16);
        for (let i = 0; i < 8; i++) {
            x.fillStyle = `rgba(40,80,30,${0.1 + Math.random() * 0.15})`;
            x.beginPath();
            x.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 0, Math.PI * 2);
            x.fill();
        }
        return { data: x.getImageData(0, 0, w, h).data, width: w, height: h };
    }

    _generateCeilingTexture(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const x = c.getContext('2d');
        x.fillStyle = '#1e1e28'; x.fillRect(0, 0, w, h);
        const cols = ['#222230', '#1c1c26', '#252535', '#1a1a24'];
        for (let by = 0; by < 4; by++) {
            for (let bx = 0; bx < 4; bx++) {
                x.fillStyle = cols[(Math.random() * cols.length) | 0];
                x.fillRect(bx * 16 + 1, by * 16 + 1, 14, 14);
                for (let i = 0; i < 4; i++) {
                    x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`;
                    x.fillRect(bx * 16 + 1 + Math.random() * 14, by * 16 + 1 + Math.random() * 14, 1 + Math.random(), 1 + Math.random());
                }
            }
        }
        return { data: x.getImageData(0, 0, w, h).data, width: w, height: h };
    }

    // --- Main render ---

    render(map, mapW, mapH, player, enemies, revealed) {
        const w = this.renderWidth;
        const h = this.renderHeight;
        const px = this.pixels;
        const halfH = h >> 1;

        // Fill initial background: dark ceiling gradient + dark floor
        for (let y = 0; y < h; y++) {
            let r, g, b;
            if (y < halfH) {
                const t = y / halfH;
                r = 26 + (t * -4) | 0; g = 26 + (t * 7) | 0; b = 46 + (t * 16) | 0;
            } else {
                const t = (y - halfH) / halfH;
                r = 42 - (t * 16) | 0; g = 42 - (t * 16) | 0; b = 42 - (t * 16) | 0;
            }
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                px[i] = r; px[i+1] = g; px[i+2] = b; px[i+3] = 255;
            }
        }

        // Camera vectors (Lodev style)
        const dirX = Math.cos(player.angle);
        const dirY = Math.sin(player.angle);
        const planeX = -dirY * this.planeMag;
        const planeY = dirX * this.planeMag;

        // Cast walls
        for (let col = 0; col < w; col++) {
            const cameraX = 2 * col / w - 1; // -1 (left) to +1 (right)
            const rayDirX = dirX + planeX * cameraX;
            const rayDirY = dirY + planeY * cameraX;
            this._castRay(px, map, mapW, mapH, player, col, rayDirX, rayDirY, w, h);
        }

        // Floor and ceiling textures
        this._renderFloorCeiling(px, player, dirX, dirY, planeX, planeY, map, mapW, mapH, w, h);

        // Sprites
        this._renderSprites(px, player, planeX, planeY, dirX, dirY, enemies, w, h);

        // Blit
        this.ctx.putImageData(this.imageData, 0, 0);

        // Enemy faces (canvas API)
        this._renderFaces(this.ctx, enemies, w, h);

        // Minimap (disabled)
        // if (revealed) {
        //     this._renderMinimap(this.ctx, map, mapW, mapH, player, enemies, revealed, w, h);
        // }
    }

    // --- Wall casting (Lodev DDA) ---

    _castRay(px, map, mapW, mapH, player, col, rayDirX, rayDirY, screenW, screenH) {
        let mapX = Math.floor(player.x);
        let mapY = Math.floor(player.y);

        const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
        const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

        let stepX, stepY, sideDistX, sideDistY;
        if (rayDirX < 0) { stepX = -1; sideDistX = (player.x - mapX) * deltaDistX; }
        else              { stepX =  1; sideDistX = (mapX + 1 - player.x) * deltaDistX; }
        if (rayDirY < 0) { stepY = -1; sideDistY = (player.y - mapY) * deltaDistY; }
        else              { stepY =  1; sideDistY = (mapY + 1 - player.y) * deltaDistY; }

        let hit = false, side = 0, wallType = 1;
        for (let i = 0; i < 100; i++) {
            if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
            else                        { sideDistY += deltaDistY; mapY += stepY; side = 1; }
            if (mapX < 0 || mapX >= mapW || mapY < 0 || mapY >= mapH) break;
            if (map[mapY][mapX] >= 1) { hit = true; wallType = map[mapY][mapX]; break; }
        }

        if (!hit) {
            this.zBuffer[col] = 1e30;
            this.wallBottom[col] = (screenH >> 1);
            this.wallTop[col] = (screenH >> 1);
            return;
        }

        // Perpendicular distance (no fisheye — Lodev DDA gives this directly)
        let perpDist;
        if (side === 0) perpDist = (mapX - player.x + (1 - stepX) / 2) / rayDirX;
        else             perpDist = (mapY - player.y + (1 - stepY) / 2) / rayDirY;
        if (perpDist < 0.01) perpDist = 0.01;

        this.zBuffer[col] = perpDist;

        const lineHeight = (screenH / perpDist) | 0;
        const halfLine = lineHeight >> 1;
        const drawStart = (screenH >> 1) - halfLine;

        // Texture X
        let wallX;
        if (side === 0) wallX = player.y + perpDist * rayDirY;
        else             wallX = player.x + perpDist * rayDirX;
        wallX -= Math.floor(wallX);

        const tex = wallType === 2 ? this.wallTextureExit : this.wallTexture;
        let texX = (wallX * tex.width) | 0;
        if (texX >= tex.width) texX = tex.width - 1;

        const fog = 1 / (1 + perpDist * 0.12);
        const darken = fog * (side === 1 ? 0.7 : 1.0);

        const yStart = Math.max(0, drawStart);
        const yEnd = Math.min(screenH - 1, drawStart + lineHeight);
        this.wallBottom[col] = Math.min(screenH, yEnd + 1);
        this.wallTop[col] = Math.max(0, yStart);

        const texStep = tex.height / lineHeight;
        let texPos = (yStart - drawStart) * texStep;
        const texData = tex.data;
        const texW = tex.width;

        for (let y = yStart; y <= yEnd; y++) {
            const texY = (texPos | 0) & (tex.height - 1);
            texPos += texStep;
            const ti = (texY * texW + texX) * 4;
            const pi = (y * screenW + col) * 4;
            px[pi]     = (texData[ti]     * darken) | 0;
            px[pi + 1] = (texData[ti + 1] * darken) | 0;
            px[pi + 2] = (texData[ti + 2] * darken) | 0;
        }
    }

    // --- Floor & ceiling casting (Lodev row-by-row, same camera vectors) ---

    _renderFloorCeiling(px, player, dirX, dirY, planeX, planeY, map, mapW, mapH, screenW, screenH) {
        const floorData = this.floorTexture.data;
        const ceilData = this.ceilTexture.data;
        const texW = this.floorTexture.width;
        const texH = this.floorTexture.height;
        const halfH = screenH / 2;

        // Leftmost & rightmost ray directions
        const rayDirX0 = dirX - planeX;
        const rayDirY0 = dirY - planeY;
        const rayDirX1 = dirX + planeX;
        const rayDirY1 = dirY + planeY;

        for (let y = (halfH | 0) + 1; y < screenH; y++) {
            const rowDist = halfH / (y - halfH);
            const fog = 1 / (1 + rowDist * 0.12);

            const stepX = rowDist * (rayDirX1 - rayDirX0) / screenW;
            const stepY = rowDist * (rayDirY1 - rayDirY0) / screenW;

            let fx = player.x + rowDist * rayDirX0;
            let fy = player.y + rowDist * rayDirY0;

            const ceilY = screenH - 1 - y;

            for (let x = 0; x < screenW; x++) {
                // Tile-wrap texture coords (handles negatives correctly)
                const txi = ((fx | 0) % texW + texW) % texW;
                const tyi = ((fy | 0) % texH + texH) % texH;
                const ti = (tyi * texW + txi) * 4;

                // Floor — only draw below wall
                if (y >= this.wallBottom[x]) {
                    const pi = (y * screenW + x) * 4;
                    px[pi]     = (floorData[ti]     * fog) | 0;
                    px[pi + 1] = (floorData[ti + 1] * fog) | 0;
                    px[pi + 2] = (floorData[ti + 2] * fog) | 0;
                }

                // Ceiling — only draw above wall
                if (ceilY < this.wallTop[x]) {
                    const pi = (ceilY * screenW + x) * 4;
                    px[pi]     = (ceilData[ti]     * fog) | 0;
                    px[pi + 1] = (ceilData[ti + 1] * fog) | 0;
                    px[pi + 2] = (ceilData[ti + 2] * fog) | 0;
                }

                fx += stepX;
                fy += stepY;
            }
        }
    }

    // --- Sprite rendering ---

    _renderSprites(px, player, planeX, planeY, dirX, dirY, enemies, screenW, screenH) {
        if (!enemies || enemies.length === 0) return;

        const spriteList = enemies.map(e => {
            const dx = e.x - player.x, dy = e.y - player.y;
            return { enemy: e, dist: dx * dx + dy * dy };
        });
        spriteList.sort((a, b) => b.dist - a.dist);

        // Inverse camera matrix for sprite projection
        const inv = 1.0 / (planeX * dirY - dirX * planeY);

        for (const { enemy, dist } of spriteList) {
            const sqrtDist = Math.sqrt(dist);
            if (sqrtDist < 0.1) continue;

            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;

            // Transform to camera space using inverse camera matrix
            const transformX = inv * (dirY * dx - dirX * dy);
            const transformY = inv * (-planeY * dx + planeX * dy);

            if (transformY <= 0.1) continue;

            const screenX = ((screenW / 2) * (1 + transformX / transformY)) | 0;
            const spriteSize = Math.abs((screenH / transformY) * enemy.radius * 2) | 0;
            const halfSize = spriteSize >> 1;

            const drawStartY = (screenH / 2 - halfSize + spriteSize * 0.15) | 0;
            const drawStartX = screenX - halfSize;
            const drawEndX = screenX + halfSize;

            const fogFactor = 1 / (1 + sqrtDist * 0.12);
            const centerX = screenX;
            const centerY = (screenH / 2 + spriteSize * 0.15) | 0;

            enemy._screenCX = centerX;
            enemy._screenCY = centerY;
            enemy._screenRX = halfSize;
            enemy._screenRY = halfSize;
            enemy._screenDist = sqrtDist;
            enemy._screenWidth = spriteSize;
            enemy._screenFog = fogFactor;
            enemy._visible = false;

            for (let col = Math.max(0, drawStartX); col < Math.min(screenW, drawEndX); col++) {
                if (transformY >= this.zBuffer[col]) continue;
                enemy._visible = true;

                const nx = (col - centerX) / halfSize;
                if (nx * nx > 1) continue;
                const arcH = Math.sqrt(1 - nx * nx);
                const y0 = Math.max(0, (centerY - arcH * halfSize) | 0);
                const y1 = Math.min(screenH - 1, (centerY + arcH * halfSize) | 0);
                if (y1 <= y0) continue;

                const shade = 1 - nx * nx * 0.4;
                const hl = Math.max(0, 1 - (nx - 0.35) * (nx - 0.35) * 8);
                const r = Math.min(255, (180 * shade + 120 * hl) * fogFactor) | 0;
                const g = Math.min(255, (35 * shade + 50 * hl) * fogFactor) | 0;
                const b = Math.min(255, (35 * shade + 25 * hl) * fogFactor) | 0;

                for (let y = y0; y <= y1; y++) {
                    const pi = (y * screenW + col) * 4;
                    px[pi] = r; px[pi+1] = g; px[pi+2] = b;
                }
            }
        }
    }

    // --- Enemy face overlay (canvas API for arcs) ---

    _renderFaces(ctx, enemies, screenW, screenH) {
        if (!enemies) return;
        for (const e of enemies) {
            if (!e._visible || e._screenDist > 8 || e._screenWidth < 20) continue;
            const cx = e._screenCX, cy = e._screenCY, rx = e._screenRX, ry = e._screenRY, fog = e._screenFog;
            const eyeSize = Math.max(2, rx * 0.15);
            const exOff = rx * 0.25, eyOff = ry * 0.15;
            const lx = cx - exOff, rxx = cx + exOff, eyeY = cy - eyOff;
            ctx.fillStyle = `rgb(${(255*fog)|0},${(255*fog)|0},${(50*fog)|0})`;
            ctx.beginPath(); ctx.arc(lx, eyeY, eyeSize, 0, Math.PI*2); ctx.arc(rxx, eyeY, eyeSize, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = `rgb(${(20*fog)|0},${(20*fog)|0},${(20*fog)|0})`;
            ctx.beginPath(); ctx.arc(lx, eyeY, eyeSize*0.5, 0, Math.PI*2); ctx.arc(rxx, eyeY, eyeSize*0.5, 0, Math.PI*2); ctx.fill();
            const my = cy + ry * 0.2, mw = rx * 0.35;
            ctx.strokeStyle = `rgb(${(40*fog)|0},${(10*fog)|0},${(10*fog)|0})`;
            ctx.lineWidth = Math.max(1, eyeSize * 0.4);
            ctx.beginPath(); ctx.moveTo(cx-mw, my); ctx.lineTo(cx-mw*0.3, my+ry*0.08); ctx.lineTo(cx+mw*0.3, my+ry*0.08); ctx.lineTo(cx+mw, my); ctx.stroke();
        }
    }

    // --- Minimap (bottom-right, small) ---

    _renderMinimap(ctx, map, mapW, mapH, player, enemies, revealed, screenW, screenH) {
        const cs = this.minimapCellSize;
        const pad = this.minimapPadding;
        const mmW = mapW * cs, mmH = mapH * cs;
        const mmX = screenW - mmW - pad;
        const mmY = screenH - mmH - pad;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);

        for (let gy = 0; gy < mapH; gy++) {
            for (let gx = 0; gx < mapW; gx++) {
                const key = gy * mapW + gx;
                if (!revealed.has(key)) {
                    ctx.fillStyle = '#111';
                } else {
                    const cell = map[gy][gx];
                    ctx.fillStyle = cell === 1 ? '#6b4423' : cell === 2 ? '#00cc00' : '#444';
                }
                ctx.fillRect(mmX + gx * cs, mmY + gy * cs, cs, cs);
            }
        }

        if (enemies && enemies.length > 0) {
            for (const e of enemies) {
                const eKey = (Math.floor(e.y)) * mapW + (Math.floor(e.x));
                if (revealed.has(eKey)) {
                    ctx.fillStyle = '#ff3333';
                    ctx.beginPath();
                    ctx.arc(mmX + e.x * cs, mmY + e.y * cs, cs * 1.2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        ctx.fillStyle = '#33ff33';
        ctx.beginPath();
        ctx.arc(mmX + player.x * cs, mmY + player.y * cs, cs, 0, Math.PI * 2);
        ctx.fill();

        const dirLen = cs * 2.5;
        ctx.strokeStyle = '#33ff33'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mmX + player.x * cs, mmY + player.y * cs);
        ctx.lineTo(mmX + player.x * cs + Math.cos(player.angle) * dirLen, mmY + player.y * cs + Math.sin(player.angle) * dirLen);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
        ctx.strokeRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);
    }
}
