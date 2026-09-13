// lib/sound.ts
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }

  // Resume context if browser suspended it
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

export function playSound(type: 'send' | 'receive') {
  try {
    const ctx = getAudioContext();
    if (!ctx || ctx.state === 'suspended') return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'send') {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } else {
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    }
  } catch {
    // Audio silently bypassed if blocked by browser policy
  }
}

export function playSendSound(): void {
  playSound('send');
}

export function playReceiveSound(): void {
  playSound('receive');
}

export function warmupAudio(): void {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch {}
}

export function initAudioOnFirstInteraction(): () => void {
  if (typeof window === 'undefined') return () => {};
  const events = ['pointerdown', 'touchstart', 'keydown', 'click'];
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