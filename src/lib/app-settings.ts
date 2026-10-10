"use client";

export type AppSettings = { sound: boolean; haptic: boolean };

const KEY = "lua_settings";
export const SETTINGS_EVENT = "lua_settings_changed";

const DEFAULTS: AppSettings = { sound: true, haptic: true };

export function getSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      sound: typeof parsed.sound === "boolean" ? parsed.sound : DEFAULTS.sound,
      haptic: typeof parsed.haptic === "boolean" ? parsed.haptic : DEFAULTS.haptic,
    };
  } catch {
    return DEFAULTS;
  }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }));
  return next;
}
