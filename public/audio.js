// Simple Procedural Audio Synthesis for Infinite Auction using Web Audio API
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

const AudioManager = {
    init: function () {
        // Returns a promise that resolves when the audio context is running
        if (audioCtx.state === 'suspended') {
            return audioCtx.resume().catch(() => {});
        }
        return Promise.resolve();
    },

    playTick: function () {
        this.init();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        // High-pitched short tap
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);

        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.06);
    },

    playThud: function () {
        this.init();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        // Low heavy impact
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

        gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.6);
    },

    playEerie: function () {
        this.init();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        const lfo = audioCtx.createOscillator();

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        // Low rumble
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(60, audioCtx.currentTime);

        // Modulate amplitude
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(5, audioCtx.currentTime);

        const lfoGain = audioCtx.createGain();
        lfoGain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        lfo.connect(lfoGain);
        lfoGain.connect(gainNode.gain);

        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 1);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime + 2);
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 4);

        lfo.start(audioCtx.currentTime);
        osc.start(audioCtx.currentTime);

        lfo.stop(audioCtx.currentTime + 4);
        osc.stop(audioCtx.currentTime + 4);
    },

    playPunch: function () {
        this.init();
        // Creates a loud exploding/smashing noise
        const bufferSize = audioCtx.sampleRate * 2; // 2 seconds
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            // White noise
            data[i] = Math.random() * 2 - 1;
        }

        const noiseSource = audioCtx.createBufferSource();
        noiseSource.buffer = buffer;

        // Filter it to make it sound bassy/impactful
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, audioCtx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 1.5);

        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5);

        noiseSource.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        noiseSource.start(audioCtx.currentTime);
    },

    // Background music helpers state placeholders
    _musicPlaying: false,
    _musicGain: null,
    _padOsc: null,
    _padGain: null,
    _padFilter: null,
    _beatInterval: null,

    startBackgroundMusic: async function () {
        if (this._musicPlaying) return;
        // Ensure the audio context is running before creating nodes
        try {
            await this.init();
        } catch (e) {}

        const now = audioCtx.currentTime;
        console.log('AudioManager: startBackgroundMusic (audioCtx.state=' + audioCtx.state + ')');

        // Master music gain
        this._musicGain = audioCtx.createGain();
        // start near-silent then ramp to audible level
        this._musicGain.gain.setValueAtTime(0.0001, now);
        this._musicGain.connect(audioCtx.destination);

        // Warm pad through a lowpass filter
        this._padGain = audioCtx.createGain();
        this._padGain.gain.setValueAtTime(0.0001, now);
        this._padFilter = audioCtx.createBiquadFilter();
        this._padFilter.type = 'lowpass';
        this._padFilter.frequency.setValueAtTime(1200, now);

        this._padGain.connect(this._padFilter);
        this._padFilter.connect(this._musicGain);

        const freqs = [110, 165, 220]; // simple triad for ambient texture
        this._padOsc = freqs.map((f, i) => {
            const o = audioCtx.createOscillator();
            o.type = (i % 2 === 0) ? 'sine' : 'triangle';
            o.frequency.setValueAtTime(f, now);
            o.detune.value = (Math.random() * 20) - 10; // slight detune
            o.connect(this._padGain);
            o.start(now);
            return o;
        });

        // Fade in pad and master gain (slightly louder default)
        this._padGain.gain.linearRampToValueAtTime(0.12, now + 1.8);
        this._musicGain.gain.linearRampToValueAtTime(0.12, now + 1.8);

        // Soft periodic pluck (scheduled via interval) routed through master gain
        this._beatInterval = setInterval(() => {
            const t = audioCtx.currentTime;
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(320 + Math.random() * 240, t);
            g.gain.setValueAtTime(0.12, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
            o.connect(g);
            g.connect(this._musicGain);
            o.start(t);
            o.stop(t + 0.24);
        }, 1600);

        this._musicPlaying = true;
        console.log('AudioManager: musicPlaying = true');
    },

    stopBackgroundMusic: function () {
        if (!this._musicPlaying) return;
        const now = audioCtx.currentTime;
        console.log('AudioManager: stopBackgroundMusic()');
        if (this._musicGain) {
            this._musicGain.gain.cancelScheduledValues(now);
            this._musicGain.gain.setValueAtTime(this._musicGain.gain.value || 0.0001, now);
            this._musicGain.gain.linearRampToValueAtTime(0.0001, now + 1.0);
        }

        // Cleanup after fade-out
        setTimeout(() => {
            try {
                if (this._padOsc) {
                    this._padOsc.forEach(o => { try { o.stop(); o.disconnect(); } catch (e) {} });
                    this._padOsc = null;
                }
                if (this._padGain) { try { this._padGain.disconnect(); } catch (e) {} this._padGain = null; }
                if (this._padFilter) { try { this._padFilter.disconnect(); } catch (e) {} this._padFilter = null; }
                if (this._musicGain) { try { this._musicGain.disconnect(); } catch (e) {} this._musicGain = null; }
                if (this._beatInterval) { clearInterval(this._beatInterval); this._beatInterval = null; }
            } catch (e) {}
            this._musicPlaying = false;
        }, 1100);
    },

    toggleBackgroundMusic: function () {
        if (this._musicPlaying) this.stopBackgroundMusic(); else this.startBackgroundMusic();
    },

    setBackgroundVolume: function (v) {
        // ensure audio context created/resumed
        try { this.init(); } catch (e) {}
        if (!this._musicGain) {
            this._musicGain = audioCtx.createGain();
            this._musicGain.connect(audioCtx.destination);
        }
        const vol = Math.max(0, Math.min(1, v));
        this._musicGain.gain.setValueAtTime(vol, audioCtx.currentTime);
    },

    getStatus: function () {
        return {
            playing: !!this._musicPlaying,
            audioState: audioCtx.state,
            masterGain: this._musicGain ? this._musicGain.gain.value : null
        };
    }
};

window.AudioManager = AudioManager;
