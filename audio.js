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

    /** Start a looping dark atmospheric drone with eerie tonal layers. */
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
        lp.frequency.value = 150;
        lp.Q.value = 1.0;

        // Slow LFO modulates filter frequency for unsettling variation
        const lfo = this._ctx.createOscillator();
        const lfoGain = this._ctx.createGain();
        lfo.frequency.value = 0.08;  // very slow, creepy drift
        lfoGain.gain.value = 80;     // ±80 Hz modulation
        lfo.connect(lfoGain).connect(lp.frequency);
        lfo.start(t);

        // Volume
        const gain = this._ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.4, t + 2.0);  // fade in

        src.connect(lp).connect(gain).connect(this._master);
        src.start(t);

        // Eerie tonal drone — detuned low oscillators for dread
        const drone1 = this._ctx.createOscillator();
        drone1.type = 'sawtooth';
        drone1.frequency.value = 48;  // very low, dissonant
        const drone1Lp = this._ctx.createBiquadFilter();
        drone1Lp.type = 'lowpass';
        drone1Lp.frequency.value = 120;
        const drone1Gain = this._ctx.createGain();
        drone1Gain.gain.setValueAtTime(0, t);
        drone1Gain.gain.linearRampToValueAtTime(0.12, t + 3.0);
        drone1.connect(drone1Lp).connect(drone1Gain).connect(this._master);
        drone1.start(t);

        // Second drone, slightly detuned for beating/unease
        const drone2 = this._ctx.createOscillator();
        drone2.type = 'sawtooth';
        drone2.frequency.value = 51;  // ~3Hz beat against drone1
        const drone2Lp = this._ctx.createBiquadFilter();
        drone2Lp.type = 'lowpass';
        drone2Lp.frequency.value = 110;
        const drone2Gain = this._ctx.createGain();
        drone2Gain.gain.setValueAtTime(0, t);
        drone2Gain.gain.linearRampToValueAtTime(0.10, t + 3.5);
        drone2.connect(drone2Lp).connect(drone2Gain).connect(this._master);
        drone2.start(t);

        this._ambientSource = src;
        this._ambientGain = gain;
        this._ambientLFO = lfo;
        this._ambientFilter = lp;
        this._ambientDrone1 = drone1;
        this._ambientDrone2 = drone2;
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
        const d1 = this._ambientDrone1;
        const d2 = this._ambientDrone2;
        setTimeout(() => {
            try { src.stop(); } catch (_) { /* ignore */ }
            try { lfo.stop(); } catch (_) { /* ignore */ }
            try { d1.stop(); } catch (_) { /* ignore */ }
            try { d2.stop(); } catch (_) { /* ignore */ }
        }, 500);

        this._ambientSource = null;
        this._ambientGain = null;
        this._ambientLFO = null;
        this._ambientFilter = null;
        this._ambientDrone1 = null;
        this._ambientDrone2 = null;
    }

    /* ------------------------------------------------------------------ */
    /*  Enemy proximity heartbeat                                          */
    /* ------------------------------------------------------------------ */

    /**
     * Update heartbeat based on distance to enemy.
     * @param {number} dist  distance in world units
     */
    updateEnemyProximity(dist) {
        const MAX_DIST = 20.0;
        const MIN_DIST = 0.6;

        if (dist >= MAX_DIST) {
            this.stopHeartbeat();
            return;
        }

        // Normalised closeness 0..1
        const t = 1 - Math.max(0, Math.min(1, (dist - MIN_DIST) / (MAX_DIST - MIN_DIST)));

        // Exponential volume curve — quiet at distance, loud up close
        const vol = t * t * 1.4;
        // Tempo: 0.3 → 2.5 beats/s
        const tempo = 0.3 + t * t * 2.2;

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

    /** Play a realistic double-pulse "lub-dub" heartbeat. */
    _playBeatPulse() {
        if (!this._ctx || !this._heartbeatGain) return;
        const t = this._ctx.currentTime;

        // "Lub" — deep chest thump (low sine + sub hit)
        this._heartPulse(t, 40, 0.15, 1.0);
        this._heartPulse(t, 28, 0.12, 0.6);   // sub-bass layer

        // "Dub" — shorter, slightly higher, 120ms later
        this._heartPulse(t + 0.12, 55, 0.10, 0.7);
        this._heartPulse(t + 0.12, 35, 0.08, 0.35);  // sub-bass layer

        // Body resonance — filtered noise thump for chest feel
        this._heartNoiseThump(t, 0.08);
        this._heartNoiseThump(t + 0.12, 0.05);
    }

    _heartPulse(startTime, freq, duration, vol) {
        const osc = this._ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        // Slight pitch drop like a real heartbeat
        osc.frequency.exponentialRampToValueAtTime(freq * 0.7, startTime + duration);

        const env = this._ctx.createGain();
        env.gain.setValueAtTime(vol, startTime);
        env.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(env).connect(this._heartbeatGain);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.01);
    }

    _heartNoiseThump(startTime, duration) {
        if (!this._noiseBuffer) return;
        const src = this._ctx.createBufferSource();
        src.buffer = this._noiseBuffer;

        const lp = this._ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 100;
        lp.Q.value = 1.5;

        const env = this._ctx.createGain();
        env.gain.setValueAtTime(0.5, startTime);
        env.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        src.connect(lp).connect(env).connect(this._heartbeatGain);
        src.start(startTime);
        src.stop(startTime + duration + 0.01);
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

    /** Demonic scream — FM-modulated shriek with heavy distortion and growl. */
    playCaughtSting() {
        if (!this._ctx) return;
        const t = this._ctx.currentTime;
        const dur = 1.5;

        // --- Screaming FM voice (carrier + modulator = inhuman vocal) ---
        // Modulator oscillator creates rapid vibrato/screaming texture
        const mod = this._ctx.createOscillator();
        mod.type = 'sawtooth';
        mod.frequency.setValueAtTime(120, t);
        mod.frequency.linearRampToValueAtTime(40, t + dur);

        const modGain = this._ctx.createGain();
        modGain.gain.setValueAtTime(600, t);  // deep FM = screaming harmonics
        modGain.gain.linearRampToValueAtTime(200, t + dur);

        // Carrier — the main scream voice
        const carrier = this._ctx.createOscillator();
        carrier.type = 'sawtooth';
        carrier.frequency.setValueAtTime(900, t);
        carrier.frequency.exponentialRampToValueAtTime(150, t + dur);

        mod.connect(modGain).connect(carrier.frequency);

        // Heavy distortion
        const dist1 = this._ctx.createWaveShaper();
        dist1.curve = this._makeDistortionCurve(800);
        dist1.oversample = '4x';

        const carrierEnv = this._ctx.createGain();
        carrierEnv.gain.setValueAtTime(0.9, t);
        carrierEnv.gain.setValueAtTime(0.9, t + 0.4);
        carrierEnv.gain.exponentialRampToValueAtTime(0.001, t + dur);

        carrier.connect(dist1).connect(carrierEnv).connect(this._master);
        mod.start(t);
        carrier.start(t);
        mod.stop(t + dur);
        carrier.stop(t + dur);

        // --- Second FM scream, detuned for chorus/thickness ---
        const mod2 = this._ctx.createOscillator();
        mod2.type = 'square';
        mod2.frequency.setValueAtTime(135, t);
        mod2.frequency.linearRampToValueAtTime(55, t + dur);

        const mod2Gain = this._ctx.createGain();
        mod2Gain.gain.setValueAtTime(500, t);
        mod2Gain.gain.linearRampToValueAtTime(150, t + dur);

        const carrier2 = this._ctx.createOscillator();
        carrier2.type = 'sawtooth';
        carrier2.frequency.setValueAtTime(950, t);
        carrier2.frequency.exponentialRampToValueAtTime(130, t + dur * 0.9);

        mod2.connect(mod2Gain).connect(carrier2.frequency);

        const dist2 = this._ctx.createWaveShaper();
        dist2.curve = this._makeDistortionCurve(600);
        dist2.oversample = '4x';

        const carrier2Env = this._ctx.createGain();
        carrier2Env.gain.setValueAtTime(0.7, t);
        carrier2Env.gain.setValueAtTime(0.7, t + 0.3);
        carrier2Env.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.9);

        carrier2.connect(dist2).connect(carrier2Env).connect(this._master);
        mod2.start(t);
        carrier2.start(t);
        mod2.stop(t + dur);
        carrier2.stop(t + dur);

        // --- Deep demonic sub-growl with tremolo ---
        const growl = this._ctx.createOscillator();
        growl.type = 'sawtooth';
        growl.frequency.setValueAtTime(55, t);
        growl.frequency.linearRampToValueAtTime(30, t + dur);

        const tremolo = this._ctx.createOscillator();
        tremolo.type = 'sine';
        tremolo.frequency.value = 15; // fast tremolo = demonic rumble

        const tremoloGain = this._ctx.createGain();
        tremoloGain.gain.value = 0.4;

        const growlAmp = this._ctx.createGain();
        growlAmp.gain.value = 0.6;
        tremolo.connect(tremoloGain).connect(growlAmp.gain);

        const growlDist = this._ctx.createWaveShaper();
        growlDist.curve = this._makeDistortionCurve(900);
        growlDist.oversample = '2x';

        const growlEnv = this._ctx.createGain();
        growlEnv.gain.setValueAtTime(0.9, t);
        growlEnv.gain.exponentialRampToValueAtTime(0.001, t + dur);

        growl.connect(growlDist).connect(growlAmp).connect(growlEnv).connect(this._master);
        tremolo.start(t);
        growl.start(t);
        tremolo.stop(t + dur);
        growl.stop(t + dur);

        // --- Harsh noise scream layer ---
        const noiseSrc = this._ctx.createBufferSource();
        noiseSrc.buffer = this._noiseBuffer;

        const noiseDist = this._ctx.createWaveShaper();
        noiseDist.curve = this._makeDistortionCurve(600);

        const noiseBp = this._ctx.createBiquadFilter();
        noiseBp.type = 'bandpass';
        noiseBp.frequency.setValueAtTime(3000, t);
        noiseBp.frequency.exponentialRampToValueAtTime(400, t + dur);
        noiseBp.Q.value = 3;

        const noiseEnv = this._ctx.createGain();
        noiseEnv.gain.setValueAtTime(0.8, t);
        noiseEnv.gain.setValueAtTime(0.7, t + 0.3);
        noiseEnv.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.8);

        noiseSrc.connect(noiseDist).connect(noiseBp).connect(noiseEnv).connect(this._master);
        noiseSrc.start(t);
        noiseSrc.stop(t + dur);
    }

    /* ------------------------------------------------------------------ */
    /*  Win sound                                                          */
    /* ------------------------------------------------------------------ */

    /** Ominous escape — heavy door slam with dissonant reverb tail. */
    playWinSound() {
        if (!this._ctx) return;
        const t = this._ctx.currentTime;

        // Massive low impact — like a heavy iron door slamming shut
        const impact = this._ctx.createOscillator();
        impact.type = 'sawtooth';
        impact.frequency.setValueAtTime(65, t);
        impact.frequency.exponentialRampToValueAtTime(25, t + 0.6);

        const impactDist = this._ctx.createWaveShaper();
        impactDist.curve = this._makeDistortionCurve(300);

        const impactEnv = this._ctx.createGain();
        impactEnv.gain.setValueAtTime(0.7, t);
        impactEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

        impact.connect(impactDist).connect(impactEnv).connect(this._master);
        impact.start(t);
        impact.stop(t + 0.6);

        // Noise slam layer — metallic crash
        const slam = this._ctx.createBufferSource();
        slam.buffer = this._noiseBuffer;
        const slamBp = this._ctx.createBiquadFilter();
        slamBp.type = 'bandpass';
        slamBp.frequency.value = 200;
        slamBp.Q.value = 1.5;
        const slamEnv = this._ctx.createGain();
        slamEnv.gain.setValueAtTime(0.6, t);
        slamEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        slam.connect(slamBp).connect(slamEnv).connect(this._master);
        slam.start(t);
        slam.stop(t + 0.3);

        // Dissonant drone aftermath — you escaped but at what cost
        const drone1 = this._ctx.createOscillator();
        drone1.type = 'sawtooth';
        drone1.frequency.value = 55;  // low A
        const drone2 = this._ctx.createOscillator();
        drone2.type = 'sawtooth';
        drone2.frequency.value = 58;  // detuned — sickening beat

        const droneLp = this._ctx.createBiquadFilter();
        droneLp.type = 'lowpass';
        droneLp.frequency.value = 100;

        const droneEnv = this._ctx.createGain();
        droneEnv.gain.setValueAtTime(0, t + 0.2);
        droneEnv.gain.linearRampToValueAtTime(0.25, t + 0.6);
        droneEnv.gain.setValueAtTime(0.25, t + 1.2);
        droneEnv.gain.exponentialRampToValueAtTime(0.001, t + 2.5);

        drone1.connect(droneLp);
        drone2.connect(droneLp);
        droneLp.connect(droneEnv).connect(this._master);
        drone1.start(t + 0.2);
        drone2.start(t + 0.2);
        drone1.stop(t + 2.5);
        drone2.stop(t + 2.5);

        // Eerie high whisper — wind through a closing passage
        const whisper = this._ctx.createBufferSource();
        whisper.buffer = this._noiseBuffer;
        const whisperBp = this._ctx.createBiquadFilter();
        whisperBp.type = 'bandpass';
        whisperBp.frequency.setValueAtTime(4000, t + 0.5);
        whisperBp.frequency.exponentialRampToValueAtTime(1500, t + 2.5);
        whisperBp.Q.value = 5;
        const whisperEnv = this._ctx.createGain();
        whisperEnv.gain.setValueAtTime(0, t + 0.5);
        whisperEnv.gain.linearRampToValueAtTime(0.08, t + 1.0);
        whisperEnv.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
        whisper.connect(whisperBp).connect(whisperEnv).connect(this._master);
        whisper.start(t + 0.5);
        whisper.stop(t + 2.5);
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
