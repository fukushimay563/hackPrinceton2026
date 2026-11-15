"use client";
import Link from "next/link";
import { useState } from "react";
import { Check, Cloud, Loader2, LogOut, Mail, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/supabase/useSession";
import { deleteCloudProfile } from "@/lib/minimizer/cloud";
import { clearProfile } from "@/lib/minimizer/persist";
import { Card } from "@/components/ui";

export default function AccountPage() {
  const auth = useSession();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!auth.configured)
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts aren&apos;t turned on</h1>
        <p className="mt-2 text-ink-2">
          This copy of FirstFunds isn&apos;t connected to Supabase, so your tax progress is saved in this browser tab only. Everything else
          works the same.
        </p>
        <p className="mt-4 text-sm text-ink-3">
          For the team: set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (or the anon key), then
          run the SQL in <code>supabase/migrations</code>. See the README.
        </p>
        <Link href="/taxes" className="mt-6 inline-block font-semibold text-brand hover:underline">
          Back to taxes
        </Link>
      </Shell>
    );

  if (auth.loading)
    return (
      <Shell>
        <div className="flex items-center gap-2 text-ink-3">
          <Loader2 size={16} className="animate-spin" /> Checking your account…
        </div>
      </Shell>
    );

  const sb = getSupabase()!;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMsg(null);
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/account` },
    });
    setBusy(false);
    setMsg(error ? { ok: false, text: "We couldn't send the link. Check the address and try again." } : { ok: true, text: `Check ${email.trim()} for a sign-in link. Open it in this browser.` });
  }

  async function guest() {
    setBusy(true);
    setMsg(null);
    const { error } = await sb.auth.signInAnonymously();
    setBusy(false);
    if (error) setMsg({ ok: false, text: "Guest accounts aren't enabled for this project. Use the email link instead." });
  }

  async function signOut() {
    await sb.auth.signOut();
    clearProfile();
    setMsg({ ok: true, text: "Signed out. Progress in this tab was cleared." });
  }

  async function deleteData() {
    setBusy(true);
    const r = await deleteCloudProfile();
    clearProfile();
    setBusy(false);
    setConfirmDelete(false);
    setMsg(r.ok ? { ok: true, text: "Your saved tax progress was deleted from your account and this tab." } : { ok: false, text: r.error });
  }

  return (
    <Shell>
      {auth.session ? (
        <>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-soft text-brand-2">
              <UserRound size={22} />
            </span>
            <div>
              <h1 className="text-xl font-semibold">{auth.label}</h1>
              <p className="text-sm text-ink-3">
                {auth.session.user.is_anonymous ? "Guest account on this browser" : "Your tax progress syncs across devices"}
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <Link href="/taxes" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-ink font-semibold text-paper">
              <Cloud size={18} /> Continue your taxes
            </Link>
            <button onClick={signOut} className="flex w-full min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card font-semibold">
              <LogOut size={18} /> Sign out
            </button>
            {confirmDelete ? (
              <div className="rounded-2xl border border-debt/30 bg-debt-soft p-4">
                <p className="text-sm text-ink">Delete your saved answers and document numbers? This can&apos;t be undone.</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setConfirmDelete(false)} className="min-h-11 flex-1 rounded-xl border border-line bg-card font-semibold">
                    Keep it
                  </button>
                  <button onClick={deleteData} disabled={busy} className="min-h-11 flex-1 rounded-xl bg-debt font-semibold text-white disabled:opacity-50">
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="flex w-full min-h-12 items-center justify-center gap-2 text-sm font-semibold text-debt hover:underline">
                <Trash2 size={16} /> Delete my saved data
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Save your progress</h1>
          <p className="mt-2 text-ink-2">Sign in to pick up your tax return on any device. No password needed.</p>
          <form onSubmit={sendLink} className="mt-6 space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-ink-2">Email</span>
              <div className="mt-1 flex items-center gap-2 rounded-2xl border-2 border-line bg-card px-4 focus-within:border-brand">
                <Mail size={18} className="text-ink-3" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent py-3.5 text-base outline-none"
                  placeholder="you@example.com"
                />
              </div>
            </label>
            <button type="submit" disabled={busy} className="flex w-full min-h-14 items-center justify-center gap-2 rounded-2xl bg-ink font-semibold text-paper disabled:opacity-50">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />} Email me a sign-in link
            </button>
          </form>
          <button onClick={guest} disabled={busy} className="mt-3 w-full min-h-14 rounded-2xl border-2 border-line bg-card font-semibold disabled:opacity-50">
            Continue as a guest
          </button>
          <p className="mt-4 flex items-start gap-2 text-xs text-ink-3">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            We save your answers and the numbers from your documents, never the files themselves, SSNs or full employer IDs. Only you can
            read your data, and you can delete it any time.
          </p>
        </>
      )}
      {msg && (
        <p role="status" className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-brand-soft text-brand-2" : "bg-warn-soft text-ink"}`}>
          {msg.ok && <Check size={16} className="mt-0.5 shrink-0" />} {msg.text}
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md">
      <Card>{children}</Card>
    </div>
  );
}
