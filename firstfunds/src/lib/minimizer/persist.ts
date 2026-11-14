"use client";
// Pause/resume. The filing profile lives in sessionStorage: it survives reloads and
// navigation in this tab and disappears when the tab closes (minimal retention).
// Only document *values* are kept, never the uploaded file itself.
import type { FilingProfile } from "./types";

const KEY = "firstfunds.filing.v1";

export function loadProfile(): FilingProfile | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as FilingProfile;
    return p && p.version === 1 ? p : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: FilingProfile) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable — the flow still works for this visit */
  }
}

export function clearProfile() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
