"use client";

import { getSettings } from "./app-settings";

export function vibrate(pattern: number | number[] = 40): void {
  if (!getSettings().haptic) return;
  if (typeof window === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {}
}
