"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, SUPABASE_CONFIGURED } from "./client";

export type AuthState = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  /** Display label: email, or "Guest" for anonymous sign-ins. */
  label: string | null;
};

export function useSession(): AuthState {
  const [state, setState] = useState<AuthState>({ configured: SUPABASE_CONFIGURED, loading: SUPABASE_CONFIGURED, session: null, label: null });

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const label = (s: Session | null) => (s ? (s.user.is_anonymous ? "Guest" : (s.user.email ?? "Signed in")) : null);
    sb.auth.getSession().then(({ data }) => setState({ configured: true, loading: false, session: data.session, label: label(data.session) }));
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) =>
      setState({ configured: true, loading: false, session, label: label(session) }),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return state;
}
