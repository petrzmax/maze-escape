/**
 * SoundManager — procedural audio via Web Audio API.
 * All sounds are synthesised at runtime (no external files).
 */
class SoundManager {
    constructor() {
        this._ctx = null;          // created lazily on first resume()
        this._master = null;       // master gain
        this._muted = false;
        this._volume = 0.5;

        // Ambient state
        this._ambientSource = null;
        this._ambientGain = null;
        this._ambientLFO = null;
        this._ambientFilter = null;

        // Heartbeat state
        this._heartbeatInterval = null;
        this._heartbeatGain = null;
        this._heartbeatTempo = 0.5;  // beats per second
        this._heartbeatRunning = false;

        // Pre-generated noise buffer (shared)
        this._noiseBuffer = null;

        // Visibility change — mute when tab hidden
        this._boundVisChange = this._onVisibilityChange.bind(this);
        document.addEventListener('visibilitychange', this._boundVisChange);
    }

    /* ------------------------------------------------------------------ */
    /*  Core                                                               */
    /* ------------------------------------------------------------------ */

    /** Ensure AudioContext exists and is running (call on user gesture). */
    resume() {
        if (!this._ctx) {
            this._ctx = new (window.AudioContext || window.webkitAudioContext)();
            this._master = this._ctx.createGain();
            this._master.gain.value = this._muted ? 0 : this._volume;
            this._master.connect(this._ctx.destination);
            this._noiseBuffer = this._createNoiseBuffer(2); // 2 s of white noise
        }
        if (this._ctx.state === 'suspended') {
            this._ctx.resume();
        }
    }

    /** Toggle mute. Returns new muted state. */
    setMuted(muted) {
        this._muted = muted;
        if (this._master) {
            this._master.gain.setTargetAtTime(
                muted ? 0 : this._volume,
                this._ctx.currentTime,
                0.05
            );
        }
        return this._muted;
    }

    get muted() {
        return this._muted;
    }

    /** Stop every running sound and disconnect. */
    cleanup() {
        this.stopAmbient();
        this.stopHeartbeat();
    }

    /* ------------------------------------------------------------------ */
    /*  Footstep                                                           */
    /* ------------------------------------------------------------------ */

    /** Short filtered-noise burst simulating a stone footstep. */
    playFootstep() {
        if (!this._ctx) return;
        const t = this._ctx.currentTime;

        // Noise source
        const src = this._ctx.createBufferSource();
        src.buffer = this._noiseBuffer;

        // Band-pass gives a "thud" character
        const bp = this._ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 600 + Math.random() * 400;  // 600-1000 Hz variation
        bp.Q.value = 1.0;

        // Envelope
        const env = this._ctx.createGain();
        env.gain.setValueAtTime(0.35, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

        src.connect(bp).connect(env).connect(this._master);
        src.start(t);
        src.stop(t + 0.08);
    }

    /* ------------------------------------------------------------------ */
    /*  Ambient drone                                                      */
    /* ------------------------------------------------------------------ */

    /** Start a looping low-frequency atmospheric drone. */
    startAmbient() {
        if (!this._ctx || this._ambientSource) return;
        const t = this._ctx.currentTime;

        // Brown noise via filtered white noise
        const src = this._ctx.createBufferSource();
        src.buffer = this._noiseBuffer;
        src.loop = true;

        // Low-pass filter for deep rumble
        const lp = this._ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 180;
        lp.Q.value = 0.7;

        // Slow LFO modulates filter frequency for subtle variation
        const lfo = this._ctx.createOscillator();
        const lfoGain = this._ctx.createGain();
        lfo.frequency.value = 0.15;  // very slow
        lfoGain.gain.value = 60;     // ±60 Hz modulation
        lfo.connect(lfoGain).connect(lp.frequency);
        lfo.start(t);

        // Volume
        const gain = this._ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.35, t + 1.5);  // fade in

        src.connect(lp).connect(gain).connect(this._master);
        src.start(t);

        this._ambientSource = src;
        this._ambientGain = gain;
        this._ambientLFO = lfo;
        this._ambientFilter = lp;
    }

    /** Fade out and stop ambient drone. */
    stopAmbient() {
        if (!this._ambientSource) return;
        const t = this._ctx.currentTime;
        try {
            this._ambientGain.gain.cancelScheduledValues(t);
            this._ambientGain.gain.setValueAtTime(this._ambientGain.gain.value, t);
            this._ambientGain.gain.linearRampToValueAtTime(0, t + 0.4);
        } catch (_) { /* already stopped */ }

        const src = this._ambientSource;
        const lfo = this._ambientLFO;
        setTimeout(() => {
            try { src.stop(); } catch (_) { /* ignore */ }
            try { lfo.stop(); } catch (_) { /* ignore */ }
        }, 500);

        this._ambientSource = null;
        this._ambientGain = null;
        this._ambientLFO = null;
        this._ambientFilter = null;
    }

    /* ------------------------------------------------------------------ */
    /*  Enemy proximity heartbeat                                          */
    /* ------------------------------------------------------------------ */

    /**
     * Update heartbeat based on distance to enemy.
     * @param {number} dist  distance in world units
     */
    updateEnemyProximity(dist) {
        const MAX_DIST = 8.0;
        const MIN_DIST = 0.6;

        if (dist >= MAX_DIST) {
            this.stopHeartbeat();
            return;
        }

        // Normalised closeness 0..1
        const t = 1 - Math.max(0, Math.min(1, (dist - MIN_DIST) / (MAX_DIST - MIN_DIST)));

        // Volume: 0 → 1.0
        const vol = t * 1.0;
        // Tempo: 0.5 → 3.0 beats/s
        const tempo = 0.5 + t * 2.5;

        if (!this._heartbeatRunning) {
            this._startHeartbeat(vol, tempo);
        } else {
            this._heartbeatTempo = tempo;
            if (this._heartbeatGain) {
                this._heartbeatGain.gain.setTargetAtTime(vol, this._ctx.currentTime, 0.1);
            }
        }
    }

    _startHeartbeat(vol, tempo) {
        if (!this._ctx || this._heartbeatRunning) return;
        this._heartbeatRunning = true;
        this._heartbeatTempo = tempo;

        const gain = this._ctx.createGain();
        gain.gain.value = vol;
        gain.connect(this._master);
        this._heartbeatGain = gain;

        this._scheduleNextBeat();
    }

    _scheduleNextBeat() {
        if (!this._heartbeatRunning) return;
        const delay = 1000 / this._heartbeatTempo;

        this._heartbeatInterval = setTimeout(() => {
            this._playBeatPulse();
            this._scheduleNextBeat();
        }, delay);
    }

    /** Play a single double-pulse "lub-dub" heartbeat. */
    _playBeatPulse() {
        if (!this._ctx || !this._heartbeatGain) return;
        const t = this._ctx.currentTime;

        // "Lub" — low thump
        this._singlePulse(t, 45, 0.10);
        // "Dub" — slightly higher, 80 ms later
        this._singlePulse(t + 0.08, 55, 0.07);
    }

    _singlePulse(startTime, freq, duration) {
        const osc = this._ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;

        const env = this._ctx.createGain();
        env.gain.setValueAtTime(1, startTime);
        env.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(env).connect(this._heartbeatGain);
        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    stopHeartbeat() {
        if (!this._heartbeatRunning) return;
        this._heartbeatRunning = false;
        if (this._heartbeatInterval) {
            clearTimeout(this._heartbeatInterval);
            this._heartbeatInterval = null;
        }
        if (this._heartbeatGain) {
            try {
                const t = this._ctx.currentTime;
                this._heartbeatGain.gain.cancelScheduledValues(t);
                this._heartbeatGain.gain.setTargetAtTime(0, t, 0.05);
            } catch (_) { /* ignore */ }
            // Disconnect after fade
            const g = this._heartbeatGain;
            setTimeout(() => { try { g.disconnect(); } catch (_) { /* ignore */ } }, 200);
            this._heartbeatGain = null;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Menu click                                                         */
    /* ------------------------------------------------------------------ */

    /** Sharp low click for UI interactions. */
    playMenuClick() {
        if (!this._ctx) return;
        const t = this._ctx.currentTime;

        // Sharp attack square pulse
        const osc = this._ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.06);

        const env = this._ctx.createGain();
        env.gain.setValueAtTime(0.35, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

        osc.connect(env).connect(this._master);
        osc.start(t);
        osc.stop(t + 0.08);
    }

    /* ------------------------------------------------------------------ */
    /*  Caught sting (game over)                                           */
    /* ------------------------------------------------------------------ */

    /** Terrifying scream — layered distorted shriek when enemy catches player. */
    playCaughtSting() {
        if (!this._ctx) return;
        const t = this._ctx.currentTime;

        // Layer 1: High-pitched shriek sweeping down (vocal scream feel)
        const scream = this._ctx.createOscillator();
        scream.type = 'sawtooth';
        scream.frequency.setValueAtTime(1400, t);
        scream.frequency.exponentialRampToValueAtTime(300, t + 0.8);

        const screamEnv = this._ctx.createGain();
        screamEnv.gain.setValueAtTime(0.8, t);
        screamEnv.gain.setValueAtTime(0.8, t + 0.15);
        screamEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.9);

        const screamDist = this._ctx.createWaveShaper();
        screamDist.curve = this._makeDistortionCurve(400);
        screamDist.oversample = '4x';

        // Formant-like resonance to sound more vocal
        const formant1 = this._ctx.createBiquadFilter();
        formant1.type = 'bandpass';
        formant1.frequency.value = 800;
        formant1.Q.value = 5;

        const formant2 = this._ctx.createBiquadFilter();
        formant2.type = 'peaking';
        formant2.frequency.value = 2500;
        formant2.gain.value = 10;
        formant2.Q.value = 3;

        scream.connect(screamDist).connect(formant1).connect(formant2)
            .connect(screamEnv).connect(this._master);
        scream.start(t);
        scream.stop(t + 0.9);

        // Layer 2: Second detuned scream for thickness
        const scream2 = this._ctx.createOscillator();
        scream2.type = 'sawtooth';
        scream2.frequency.setValueAtTime(1450, t);
        scream2.frequency.exponentialRampToValueAtTime(280, t + 0.85);

        const scream2Env = this._ctx.createGain();
        scream2Env.gain.setValueAtTime(0.5, t);
        scream2Env.gain.exponentialRampToValueAtTime(0.001, t + 0.85);

        const scream2Dist = this._ctx.createWaveShaper();
        scream2Dist.curve = this._makeDistortionCurve(350);
        scream2Dist.oversample = '4x';

        scream2.connect(scream2Dist).connect(scream2Env).connect(this._master);
        scream2.start(t);
        scream2.stop(t + 0.85);

        // Layer 3: Deep demonic growl underneath
        const growl = this._ctx.createOscillator();
        growl.type = 'sawtooth';
        growl.frequency.setValueAtTime(70, t);
        growl.frequency.linearRampToValueAtTime(40, t + 1.0);

        const growlEnv = this._ctx.createGain();
        growlEnv.gain.setValueAtTime(0.7, t);
        growlEnv.gain.exponentialRampToValueAtTime(0.001, t + 1.0);

        const growlDist = this._ctx.createWaveShaper();
        growlDist.curve = this._makeDistortionCurve(500);
        growlDist.oversample = '2x';

        growl.connect(growlDist).connect(growlEnv).connect(this._master);
        growl.start(t);
        growl.stop(t + 1.0);

        // Layer 4: Noise burst — chaotic scream texture
        const noiseSrc = this._ctx.createBufferSource();
        noiseSrc.buffer = this._noiseBuffer;

        const noiseBp = this._ctx.createBiquadFilter();
        noiseBp.type = 'bandpass';
        noiseBp.frequency.setValueAtTime(2000, t);
        noiseBp.frequency.exponentialRampToValueAtTime(500, t + 0.7);
        noiseBp.Q.value = 2;

        const noiseEnv = this._ctx.createGain();
        noiseEnv.gain.setValueAtTime(0.6, t);
        noiseEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

        noiseSrc.connect(noiseBp).connect(noiseEnv).connect(this._master);
        noiseSrc.start(t);
        noiseSrc.stop(t + 0.7);
    }

    /* ------------------------------------------------------------------ */
    /*  Win sound                                                          */
    /* ------------------------------------------------------------------ */

    /** Dark, tense escape confirmation — low dissonant tones with eerie release. */
    playWinSound() {
        if (!this._ctx) return;
        const t = this._ctx.currentTime;

        // Dark minor tones: C3, Eb3, then a low G2 resolve
        const notes = [
            { freq: 130.81, start: 0,    dur: 0.5,  type: 'sawtooth', vol: 0.2 },
            { freq: 155.56, start: 0.15, dur: 0.5,  type: 'sawtooth', vol: 0.18 },
            { freq: 98.00,  start: 0.45, dur: 0.8,  type: 'triangle', vol: 0.25 },
        ];

        notes.forEach((n) => {
            const start = t + n.start;
            const osc = this._ctx.createOscillator();
            osc.type = n.type;
            osc.frequency.value = n.freq;

            // Low-pass filter for muffled, dungeon-like quality
            const lp = this._ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 400;
            lp.Q.value = 2;

            const env = this._ctx.createGain();
            env.gain.setValueAtTime(n.vol, start);
            env.gain.setValueAtTime(n.vol, start + n.dur * 0.3);
            env.gain.exponentialRampToValueAtTime(0.001, start + n.dur);

            osc.connect(lp).connect(env).connect(this._master);
            osc.start(start);
            osc.stop(start + n.dur);
        });

        // Breathy noise tail — like a heavy exhale of relief
        const noiseSrc = this._ctx.createBufferSource();
        noiseSrc.buffer = this._noiseBuffer;
        const noiseLp = this._ctx.createBiquadFilter();
        noiseLp.type = 'bandpass';
        noiseLp.frequency.value = 300;
        noiseLp.Q.value = 0.8;
        const noiseEnv = this._ctx.createGain();
        noiseEnv.gain.setValueAtTime(0, t + 0.5);
        noiseEnv.gain.linearRampToValueAtTime(0.1, t + 0.7);
        noiseEnv.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
        noiseSrc.connect(noiseLp).connect(noiseEnv).connect(this._master);
        noiseSrc.start(t + 0.5);
        noiseSrc.stop(t + 1.4);
    }

    /* ------------------------------------------------------------------ */
    /*  Helpers                                                            */
    /* ------------------------------------------------------------------ */

    /** Create a buffer filled with white noise. */
    _createNoiseBuffer(durationSec) {
        const length = this._ctx.sampleRate * durationSec;
        const buf = this._ctx.createBuffer(1, length, this._ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buf;
    }

    /** Generate a simple waveshaper distortion curve. */
    _makeDistortionCurve(amount) {
        const n = 256;
        const curve = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const x = (i * 2) / n - 1;
            curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
        }
        return curve;
    }

    /** Pause / resume audio when tab visibility changes. */
    _onVisibilityChange() {
        if (!this._ctx) return;
        if (document.hidden) {
            this._ctx.suspend();
        } else {
            if (!this._muted) {
                this._ctx.resume();
            }
        }
    }
}
