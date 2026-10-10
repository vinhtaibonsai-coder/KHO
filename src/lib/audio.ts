"use client";

import { getSettings } from "./app-settings";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

export function playTone(freq: number, ms: number, type: OscillatorType = "sine"): void {
  const audio = getCtx();
  if (!audio) return;
  try {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(now);
    osc.stop(now + ms / 1000 + 0.02);
  } catch {}
}

/** Tiếng "ting" 2 nốt khi có tin Zalo mới nạp mã */
export function tingNewMessage(): void {
  if (!getSettings().sound) return;
  playTone(880, 90);
  window.setTimeout(() => playTone(1174, 90), 100);
}

/** Tiếng "ting" 1 nốt cao khi tìm thấy vị trí kho */
export function tingFound(): void {
  if (!getSettings().sound) return;
  playTone(1318, 120);
}
