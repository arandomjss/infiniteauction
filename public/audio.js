// Simple Procedural Audio Synthesis for Infinite Auction using Web Audio API
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

const AudioManager = {
    init: function () {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
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
    }
};

window.AudioManager = AudioManager;
