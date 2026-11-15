// Runs the real migration in PGlite (Postgres compiled to WASM) with a minimal
// stand-in for Supabase's auth schema, then checks row-level security.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const profile = JSON.stringify({ version: 1, answers: {}, skipped: [], documents: [], uploadsDone: false, verified: false, approvedAt: null, revision: 1 });

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), "utf8"));
  return db;
}

async function as(db: PGlite, role: "anon" | "authenticated", uid: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${role};`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role;");
  }
}

test("users can only read and write their own rows", async () => {
  const db = await setup();
  await as(db, "authenticated", A, "insert into public.filing_profiles (user_id, profile) values ($1, $2)", [A, profile]);
  await as(db, "authenticated", B, "insert into public.filing_profiles (user_id, profile) values ($1, $2)", [B, profile]);

  const seenByA = await as(db, "authenticated", A, "select user_id from public.filing_profiles");
  assert.deepEqual(seenByA.rows, [{ user_id: A }]);

  // A can't write B's row: insert rejected, update/delete affect nothing.
  await assert.rejects(as(db, "authenticated", A, "insert into public.filing_profiles (user_id, profile) values ($1, $2) on conflict (user_id) do update set revision = 99", [B, profile]));
  const upd = await as(db, "authenticated", A, "update public.filing_profiles set revision = 5 where user_id = $1", [B]);
  assert.equal(upd.affectedRows, 0);
  const del = await as(db, "authenticated", A, "delete from public.filing_profiles where user_id = $1", [B]);
  assert.equal(del.affectedRows, 0);

  // A can update and delete their own row.
  const own = await as(db, "authenticated", A, "update public.filing_profiles set revision = 2 where user_id = $1", [A]);
  assert.equal(own.affectedRows, 1);
});

test("signed-out visitors can't read anything", async () => {
  const db = await setup();
  await as(db, "authenticated", A, "insert into public.academy_progress (user_id, progress) values ($1, '{}')", [A]);
  await assert.rejects(as(db, "anon", null, "select * from public.academy_progress"));
  await assert.rejects(as(db, "anon", null, "select * from public.filing_profiles"));
});

test("constraints reject unexpected profile formats", async () => {
  const db = await setup();
  await assert.rejects(as(db, "authenticated", A, "insert into public.filing_profiles (user_id, profile) values ($1, '{\"version\":2}')", [A]));
});

test("updated_at refreshes on update; rows cascade when the user is deleted", async () => {
  const db = await setup();
  await as(db, "authenticated", A, "insert into public.academy_progress (user_id, progress, updated_at) values ($1, '{}', '2020-01-01')", [A]);
  await as(db, "authenticated", A, "update public.academy_progress set progress = '{\"x\":1}' where user_id = $1", [A]);
  const r = await db.query<{ y: number }>("select extract(year from updated_at)::int as y from public.academy_progress");
  assert.ok(r.rows[0].y > 2020);
  await db.exec(`delete from auth.users where id = '${A}'`);
  const left = await db.query("select * from public.academy_progress");
  assert.equal(left.rows.length, 0);
});

// ------------------------------------------------------------------ agent tables
test("agent memory, links, outbox and audit are private; events are service-only", async () => {
  const db = await setup();
  // Service-role writes (superuser here).
  await db.exec(`
    insert into public.agent_memory (user_id, kind, payload_enc) values ('${A}', 'validation', 'v1.x.y.z'), ('${B}', 'validation', 'v1.a.b.c');
    insert into public.message_outbox (idempotency_key, user_id, status) values ('k1', '${A}', 'sent'), ('k2', '${B}', 'sent');
    insert into public.audit_log (user_id, actor, action) values ('${A}', 'user', 'x'), ('${B}', 'user', 'y');
    insert into public.photon_events (event_id) values ('evt1');
  `);
  for (const table of ["agent_memory", "message_outbox", "audit_log"]) {
    const rows = await as(db, "authenticated", A, `select user_id from public.${table}`);
    assert.deepEqual(rows.rows.map((r) => (r as { user_id: string }).user_id), [A], table);
  }
  // Users can't write agent memory or audit entries directly.
  await assert.rejects(as(db, "authenticated", A, "insert into public.agent_memory (user_id, kind, payload_enc) values ($1, 'pattern', 'x')", [A]));
  await assert.rejects(as(db, "authenticated", A, "insert into public.audit_log (user_id, actor, action) values ($1, 'agent', 'fake')", [A]));
  await assert.rejects(as(db, "authenticated", A, "select * from public.photon_events"));
  // Consent link: own only.
  await as(db, "authenticated", A, "insert into public.channel_links (phone, user_id, notify_consent) values ('+15555550123', $1, true)", [A]);
  await assert.rejects(as(db, "authenticated", A, "insert into public.channel_links (phone, user_id) values ('+15555550124', $1)", [B]));
  const bSees = await as(db, "authenticated", B, "select phone from public.channel_links");
  assert.equal(bSees.rows.length, 0);
  // Duplicate event ids are rejected by the primary key.
  await assert.rejects(db.exec("insert into public.photon_events (event_id) values ('evt1')"));
});

test("shared knowledge rejects identifiers and amounts", async () => {
  const db = await setup();
  await db.exec("insert into public.shared_knowledge (kind, note) values ('pattern', 'Sign the raw body bytes, not re-serialized JSON')");
  await assert.rejects(db.exec("insert into public.shared_knowledge (kind, note) values ('pattern', 'user 123-45-6789')"));
  await assert.rejects(db.exec("insert into public.shared_knowledge (kind, note) values ('pattern', 'refund was $215')"));
  const rows = await as(db, "authenticated", A, "select note from public.shared_knowledge");
  assert.equal(rows.rows.length, 1);
});
