"use client";
// Cross-device pause/resume through Supabase. Row-level security limits each user to
// their own row (see supabase/migrations). Only the filing profile is stored: the
// answers and the box values read from documents. Never files, SSNs or full EINs.
import { getSupabase } from "../supabase/client";
import type { FilingProfile } from "./types";

const TABLE = "filing_profiles";

export type CloudResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function userId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function loadCloudProfile(): Promise<CloudResult<FilingProfile | null>> {
  const sb = getSupabase();
  const uid = await userId();
  if (!sb || !uid) return { ok: true, data: null };
  const { data, error } = await sb.from(TABLE).select("profile").eq("user_id", uid).maybeSingle();
  if (error) return { ok: false, error: "Couldn't load your saved progress." };
  const p = data?.profile as FilingProfile | undefined;
  return { ok: true, data: p && p.version === 1 ? p : null };
}

export async function saveCloudProfile(profile: FilingProfile): Promise<CloudResult<null>> {
  const sb = getSupabase();
  const uid = await userId();
  if (!sb || !uid) return { ok: true, data: null };
  const { error } = await sb.from(TABLE).upsert({ user_id: uid, profile, revision: profile.revision }, { onConflict: "user_id" });
  return error ? { ok: false, error: "Couldn't save to your account. Progress is still saved in this tab." } : { ok: true, data: null };
}

export async function deleteCloudProfile(): Promise<CloudResult<null>> {
  const sb = getSupabase();
  const uid = await userId();
  if (!sb || !uid) return { ok: true, data: null };
  const { error } = await sb.from(TABLE).delete().eq("user_id", uid);
  return error ? { ok: false, error: "Couldn't delete your saved data. Please try again." } : { ok: true, data: null };
}

/** Pick which saved copy to resume from: the most recently saved one wins. */
export function pickNewer(local: FilingProfile | null, cloud: FilingProfile | null): FilingProfile | null {
  if (!local) return cloud;
  if (!cloud) return local;
  return (cloud.savedAt ?? 0) >= (local.savedAt ?? 0) ? cloud : local;
}
