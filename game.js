/**
 * Game — main loop, state machine, module wiring, HUD, fog-of-war minimap.
 */
(function () {
    const MAZE_CELLS_W = 18;
    const MAZE_CELLS_H = 18;
    const ENEMY_CATCH_DIST = 0.6;
    const EXIT_REACH_DIST = 0.8;
    const ENEMY_SPAWN_DELAY = 3;
    const REVEAL_RADIUS = 5; // cells around player that get revealed

    // Game states
    const STATE_TITLE = 0;
    const STATE_PLAYING = 1;
    const STATE_WIN = 2;
    const STATE_GAMEOVER = 3;
    const STATE_PAUSED = 4;

    // DOM elements
    const canvas = document.getElementById('gameCanvas');
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlayTitle');
    const overlaySubtitle = document.getElementById('overlaySubtitle');
    const overlayControls = document.getElementById('overlayControls');
    const overlayPrompt = document.getElementById('overlayPrompt');
    const timerEl = document.getElementById('timer');


    // Audio
    const soundManager = new SoundManager();

    let state = STATE_TITLE;
    let raycaster = null;
    let player = null;
    let enemy = null;
    let mazeData = null;
    let gameTime = 0;
    let enemySpawnTimer = 0;
    let enemyActive = false;
    let lastTime = 0;
    let animFrameId = null;
    let showMinimap = false;
    let restartLocked = false;

    // Footstep cadence timer
    let footstepTimer = 0;
    const FOOTSTEP_INTERVAL = 0.35; // seconds between footsteps

    // Fog-of-war: set of revealed cell keys (gy * mapW + gx)
    let revealed = new Set();

    function init() {
        raycaster = new Raycaster(canvas);
        showOverlay('MAZE ESCAPE',
            'Navigate the labyrinth. Avoid the enemy.<br>Find the way out!',
            true,
            'Press any key to start');
        state = STATE_TITLE;

        document.addEventListener('keydown', handleGlobalKey);

        // Handle window resize
        window.addEventListener('resize', onResize);

        loop(performance.now());
    }

    function onResize() {
        if (raycaster) {
            raycaster.resize();
        }
    }

    function handleGlobalKey(e) {
        // Resume audio context on any user gesture (browser policy)
        soundManager.resume();

        // ] — toggle minimap (hidden feature)
        if (e.code === 'BracketRight') {
            showMinimap = !showMinimap;
            return;
        }

        // ESC — pause / unpause
        if (e.code === 'Escape') {
            if (state === STATE_PLAYING) {
                pauseGame();
                return;
            }
            if (state === STATE_PAUSED) {
                resumeGame();
                return;
            }
            return;
        }

        // Any other key on overlay screens
        if (state === STATE_TITLE || state === STATE_WIN || state === STATE_GAMEOVER) {
            if (restartLocked) return;
            startGame();
        }
        if (state === STATE_PAUSED) {
            // Any key other than ESC also resumes
            resumeGame();
        }
    }

    function pauseGame() {
        state = STATE_PAUSED;
        soundManager.playMenuClick();
        soundManager.stopAmbient();
        soundManager.stopHeartbeat();
        showOverlay('PAUSED',
            'Game is paused.',
            false,
            'Press ESC or any key to resume');
    }

    function resumeGame() {
        state = STATE_PLAYING;
        soundManager.playMenuClick();
        soundManager.startAmbient();
        hideOverlay();
        lastTime = performance.now(); // reset dt so no jump
    }

    function startGame() {
        // Stop any lingering sounds from previous round
        soundManager.cleanup();

        // Generate a new maze
        mazeData = generateMaze(MAZE_CELLS_W, MAZE_CELLS_H);

        // Create player at start position
        player = new Player(mazeData.start.x, mazeData.start.y);
        player.angle = 0;
        player.setupInput();

        // Enemy spawn position — center of maze
        const enemySpawnX = Math.floor(MAZE_CELLS_W / 2) * 2 + 1 + 0.5;
        const enemySpawnY = Math.floor(MAZE_CELLS_H / 2) * 2 + 1 + 0.5;
        enemy = new Enemy(enemySpawnX, enemySpawnY);

        gameTime = 0;
        enemySpawnTimer = 0;
        enemyActive = false;
        footstepTimer = 0;

        // Reset fog-of-war
        revealed = new Set();
        revealAround(player.x, player.y);

        hideOverlay();

        state = STATE_PLAYING;
        lastTime = performance.now();

        // Start audio
        soundManager.playMenuClick();
        soundManager.startAmbient();
    }

    function revealAround(px, py) {
        const r = REVEAL_RADIUS;
        const cx = Math.floor(px);
        const cy = Math.floor(py);
        const mapW = mazeData.mapW;
        const mapH = mazeData.mapH;

        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                const gx = cx + dx;
                const gy = cy + dy;
                if (gx >= 0 && gx < mapW && gy >= 0 && gy < mapH) {
                    revealed.add(gy * mapW + gx);
                }
            }
        }
    }

    function showOverlay(title, subtitle, showControls, prompt, titleColor) {
        overlayTitle.textContent = title;
        overlayTitle.style.color = titleColor || '#ff4444';
        overlayTitle.style.textShadow = `0 0 20px ${titleColor || '#ff4444'}80`;
        overlaySubtitle.innerHTML = subtitle;
        overlayControls.style.display = showControls ? 'block' : 'none';
        overlayPrompt.textContent = prompt;
        overlay.classList.add('visible');
    }

    function hideOverlay() {
        overlay.classList.remove('visible');
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function loop(timestamp) {
        const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
        lastTime = timestamp;

        if (state === STATE_PLAYING) {
            gameTime += dt;

            // Update player
            player.update(dt, mazeData.map, mazeData.mapW, mazeData.mapH);

            // Footstep sounds
            if (player.isMoving()) {
                footstepTimer -= dt;
                if (footstepTimer <= 0) {
                    soundManager.playFootstep();
                    footstepTimer = FOOTSTEP_INTERVAL;
                }
            } else {
                footstepTimer = 0; // reset so first step is immediate
            }

            // Reveal cells around player
            revealAround(player.x, player.y);

            // Enemy spawn delay
            enemySpawnTimer += dt;
            if (!enemyActive && enemySpawnTimer >= ENEMY_SPAWN_DELAY) {
                enemyActive = true;
            }

            // Update enemy
            if (enemyActive) {
                enemy.update(dt, mazeData.map, mazeData.mapW, mazeData.mapH, player.x, player.y);

                const distToEnemy = enemy.distToPlayer(player.x, player.y);

                // Heartbeat proximity sound
                soundManager.updateEnemyProximity(distToEnemy);

                if (distToEnemy < ENEMY_CATCH_DIST) {
                    onGameOver();
                }
            }

            // Check exit
            const exitDx = player.x - mazeData.exit.x;
            const exitDy = player.y - mazeData.exit.y;
            if (Math.sqrt(exitDx * exitDx + exitDy * exitDy) < EXIT_REACH_DIST) {
                onWin();
            }
        }

        // Render
        if (mazeData && player) {
            const enemies = enemyActive ? [enemy] : [];
            raycaster.showMinimap = showMinimap;
            raycaster.render(mazeData.map, mazeData.mapW, mazeData.mapH, player, enemies, revealed);
        } else {
            renderTitleScene();
        }

        animFrameId = requestAnimationFrame(loop);
    }

    function renderTitleScene() {
        const ctx = raycaster.ctx;
        const w = raycaster.renderWidth;
        const h = raycaster.renderHeight;

        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0a0a1a');
        grad.addColorStop(0.5, '#1a1a2e');
        grad.addColorStop(1, '#0a0a0a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(139, 69, 19, 0.3)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 20; i++) {
            const x = (i / 20) * w;
            const heightVar = 50 + Math.sin(i * 0.7 + performance.now() * 0.001) * 30;
            ctx.beginPath();
            ctx.moveTo(x, h / 2 - heightVar);
            ctx.lineTo(x, h / 2 + heightVar);
            ctx.stroke();
        }
    }

    function onWin() {
        state = STATE_WIN;
        player.removeInput();
        soundManager.stopAmbient();
        soundManager.stopHeartbeat();
        soundManager.playWinSound();
        showOverlay('YOU ESCAPED!',
            `Time: ${formatTime(gameTime)}<br>Congratulations!`,
            false,
            'Press any key to play again',
            '#33ff33');
    }

    function onGameOver() {
        state = STATE_GAMEOVER;
        player.removeInput();
        soundManager.stopAmbient();
        soundManager.stopHeartbeat();
        soundManager.playCaughtSting();

        // Lock input briefly to prevent accidental restart
        restartLocked = true;
        showOverlay('CAUGHT!',
            `The enemy got you after ${formatTime(gameTime)}.<br>Better luck next time!`,
            false,
            '');

        setTimeout(() => {
            restartLocked = false;
            overlayPrompt.textContent = 'Press any key to try again';
        }, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
