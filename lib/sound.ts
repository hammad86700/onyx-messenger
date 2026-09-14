// lib/sound.ts
/**
 * Onyx Audio & Sound Synthesizer
 * Generates punchy, pleasant, WhatsApp & iOS-style notification chimes and pops using Web Audio API.
 */

let audioCtx: AudioContext | null = null;
let lastReceiveSoundTime = 0;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    try {
      audioCtx = new AudioContextClass();
    } catch {
      return null;
    }
  }

  // Resume context if suspended by browser autoplay policy
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

/**
 * Triggers mobile device haptic vibration pattern.
 */
export function vibrateDevice(pattern: number | number[] = [150, 75, 150, 75, 250]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.(pattern);
    }
  } catch {}
}

/**
 * Plays high-fidelity sound synthesized via Web Audio oscillators.
 */
export function playSound(type: 'send' | 'receive' | 'call_ring') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    if (type === 'send') {
      // Crisp, subtle message sent pop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.start(now);
      osc.stop(now + 0.07);
    } else if (type === 'receive') {
      // Resonant, crisp WhatsApp-style dual chime (830Hz G#5 -> 1175Hz D6)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      const gain2 = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      osc1.connect(gain1);
      osc2.connect(gain2);
      gain1.connect(ctx.destination);
      gain2.connect(ctx.destination);

      // Note 1: punchy warm tone
      osc1.frequency.setValueAtTime(830.6, now);
      gain1.gain.setValueAtTime(0.32, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

      // Note 2: bright ringing bell chime
      osc2.frequency.setValueAtTime(1174.7, now + 0.07);
      gain2.gain.setValueAtTime(0.001, now);
      gain2.gain.setValueAtTime(0.35, now + 0.07);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc1.start(now);
      osc1.stop(now + 0.14);

      osc2.start(now + 0.07);
      osc2.stop(now + 0.33);

      // Trigger phone vibration
      vibrateDevice([150, 75, 150, 75, 250]);
    } else if (type === 'call_ring') {
      // Ringtone alert for incoming call
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(480, now + 0.2);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

      osc.start(now);
      osc.stop(now + 0.5);

      vibrateDevice([400, 200, 400]);
    }
  } catch {
    // Audio bypassed gracefully if device is fully muted
  }
}

export function playSendSound(): void {
  playSound('send');
}

export function playReceiveSound(): void {
  const nowMs = Date.now();
  if (nowMs - lastReceiveSoundTime < 300) return;
  lastReceiveSoundTime = nowMs;

  playSound('receive');
}

/**
 * Warms up and unlocks Web Audio context on the first user interaction.
 */
export function warmupAudio(): void {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch {}
}

/**
 * Attaches one-time interaction listeners to reliably unlock browser audio playback.
 */
export function initAudioOnFirstInteraction(): () => void {
  if (typeof window === 'undefined') return () => {};
  const events = ['pointerdown', 'touchstart', 'keydown', 'click', 'visibilitychange', 'focus'];

  const handleInteraction = () => {
    warmupAudio();
    for (const evt of events) {
      window.removeEventListener(evt, handleInteraction, { capture: true } as any);
    }
  };

  for (const evt of events) {
    window.addEventListener(evt, handleInteraction, { capture: true, passive: true });
  }

  return () => {
    for (const evt of events) {
      window.removeEventListener(evt, handleInteraction, { capture: true } as any);
    }
  };
}