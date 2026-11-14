"use client";
// Optional Supabase connection. If the env vars aren't set (or in the single-file
// static build), getSupabase() returns null and the app falls back to tab-only storage.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { IS_STATIC } from "../runtime";

// Vercel's Supabase integration sets NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY on newer
// projects and NEXT_PUBLIC_SUPABASE_ANON_KEY on older ones; either works here.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const SUPABASE_CONFIGURED = !IS_STATIC && !!URL && !!KEY;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_CONFIGURED || typeof window === "undefined") return null;
  if (!client) {
    client = createClient(URL!, KEY!, {
      auth: {
        flowType: "pkce", // magic-link codes are exchanged in the same browser
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
