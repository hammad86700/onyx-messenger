// Onyx Call Audio Synthesizer & Ringtone Engine (Zero-Latency Web Audio API)

class CallSoundEngine {
  private ctx: AudioContext | null = null;
  private ringtoneInterval: any = null;
  private ringbackInterval: any = null;
  private isRinging = false;
  private isRingbacking = false;

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Start authentic WhatsApp-style rhythmic melodic ringtone loop
   */
  startRingtone() {
    if (typeof window === 'undefined' || this.isRinging) return;
    this.isRinging = true;

    const playChimePattern = () => {
      if (!this.isRinging) return;
      try {
        const ctx = this.getContext();
        const now = ctx.currentTime;

        // WhatsApp-style gentle harmonic arpeggio (E5, G#5, B5, E6)
        const notes = [
          { freq: 659.25, time: 0.0, dur: 0.12 },
          { freq: 830.61, time: 0.14, dur: 0.12 },
          { freq: 987.77, time: 0.28, dur: 0.14 },
          { freq: 1318.51, time: 0.44, dur: 0.22 },
          // Second phrase
          { freq: 987.77, time: 0.8, dur: 0.12 },
          { freq: 1318.51, time: 0.94, dur: 0.3 },
        ];

        notes.forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + time);

          gain.gain.setValueAtTime(0, now + time);
          gain.gain.linearRampToValueAtTime(0.28, now + time + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + time);
          osc.stop(now + time + dur + 0.05);
        });

        // Trigger vibration if available on mobile
        if ('vibrate' in navigator) {
          navigator.vibrate?.([200, 100, 200, 600]);
        }
      } catch (err) {
        console.warn('Ringtone playback notice:', err);
      }
    };

    playChimePattern();
    this.ringtoneInterval = setInterval(playChimePattern, 2400);
  }

  /**
   * Stop ringtone immediately
   */
  stopRingtone() {
    this.isRinging = false;
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    if ('vibrate' in navigator) {
      navigator.vibrate?.(0);
    }
  }

  /**
   * Start classic outgoing phone ringback tone (440Hz + 480Hz dual tone)
   */
  startRingback() {
    if (typeof window === 'undefined' || this.isRingbacking) return;
    this.isRingbacking = true;

    const playDualTone = () => {
      if (!this.isRingbacking) return;
      try {
        const ctx = this.getContext();
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.09, now + 0.05);
        gain.gain.setValueAtTime(0.09, now + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.3);
        osc2.stop(now + 1.3);
      } catch {}
    };

    playDualTone();
    this.ringbackInterval = setInterval(playDualTone, 3200);
  }

  /**
   * Stop outgoing ringback tone
   */
  stopRingback() {
    this.isRingbacking = false;
    if (this.ringbackInterval) {
      clearInterval(this.ringbackInterval);
      this.ringbackInterval = null;
    }
  }

  /**
   * Play call connected confirmation chime
   */
  playCallConnected() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.28);
      });
    } catch {}
  }

  /**
   * Play call ended descending disconnect tone
   */
  playCallEnded() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      [659.25, 440.0].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.15, now + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.22);
      });
    } catch {}
  }

  /**
   * Play Zoom/Meet user joined room chime
   */
  playMeetingJoinSound() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      [440, 554.37, 659.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);

        gain.gain.setValueAtTime(0, now + idx * 0.06);
        gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.06 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.18);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.2);
      });
    } catch {}
  }

  /**
   * Stop all active sounds immediately
   */
  stopAll() {
    this.stopRingtone();
    this.stopRingback();
  }
}

export const callSound = new CallSoundEngine();
