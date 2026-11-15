// Gemini model selection: one resolver for every AI path, GEMINI_MODEL wins, one fallback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { GEMINI_MODEL_FALLBACK, resolveGeminiModel } from "../src/lib/server/geminiModel.mjs";
import { geminiModel, geminiModelInfo } from "../src/lib/server/gemini";
import { captureLogs } from "../src/lib/agents/logger";
import { answerQuestion, GENERAL_CONTEXT } from "../src/lib/tutor/answer";

function setEnv(vars: Record<string, string | undefined>) {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => void (process.env = saved);
}
function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const restore = setEnv(vars);
  try {
    return fn();
  } finally {
    restore();
  }
}

test("GEMINI_MODEL overrides the fallback", () => {
  assert.deepEqual(resolveGeminiModel({ GEMINI_MODEL: "gemini-3.5-flash" }), { model: "gemini-3.5-flash", source: "GEMINI_MODEL" });
  assert.deepEqual(resolveGeminiModel({ GEMINI_MODEL: "gemini-2.0-pro-exp" }), { model: "gemini-2.0-pro-exp", source: "GEMINI_MODEL" });
  withEnv({ GEMINI_MODEL: "gemini-custom-test" }, () => {
    assert.equal(geminiModel(), "gemini-custom-test");
    assert.equal(geminiModelInfo().source, "GEMINI_MODEL");
  });
});

test("unset or blank GEMINI_MODEL uses the one documented fallback", () => {
  assert.deepEqual(resolveGeminiModel({}), { model: GEMINI_MODEL_FALLBACK, source: "fallback" });
  assert.deepEqual(resolveGeminiModel({ GEMINI_MODEL: "   " }), { model: GEMINI_MODEL_FALLBACK, source: "fallback" });
  withEnv({ GEMINI_MODEL: undefined }, () => assert.equal(geminiModel(), GEMINI_MODEL_FALLBACK));
});

test("copy-paste damage in GEMINI_MODEL is cleaned; garbage falls back with a warning", () => {
  assert.equal(resolveGeminiModel({ GEMINI_MODEL: ' "gemini-3.5-flash"\n' }).model, "gemini-3.5-flash");
  assert.equal(resolveGeminiModel({ GEMINI_MODEL: "models/gemini-3.5-flash" }).model, "gemini-3.5-flash");
  const bad = resolveGeminiModel({ GEMINI_MODEL: "gemini 3.5; rm -rf" });
  assert.equal(bad.model, GEMINI_MODEL_FALLBACK);
  assert.equal(bad.source, "fallback");
  assert.ok(bad.warning);
});

test("the model is read at call time, not frozen at import/build time", () => {
  withEnv({ GEMINI_MODEL: "gemini-a" }, () => assert.equal(geminiModel(), "gemini-a"));
  withEnv({ GEMINI_MODEL: "gemini-b" }, () => assert.equal(geminiModel(), "gemini-b"));
});

test("no AI code path hardcodes a model name outside the resolver", () => {
  const roots = ["src", "scripts"];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs|mts|js)$/.test(name) && !p.endsWith(join("server", "geminiModel.mjs"))) {
        const src = readFileSync(p, "utf8");
        if (/["'`]gemini-\d/.test(src)) offenders.push(p);
        if (/process\.env\.GEMINI_MODEL/.test(src)) offenders.push(`${p} (reads GEMINI_MODEL directly)`);
      }
    }
  };
  roots.forEach(walk);
  assert.deepEqual(offenders, []);
});

test("advisor logs which model/path answered, without the question or figures", async () => {
  const cap = captureLogs();
  const restore = setEnv({ GEMINI_API_KEY: undefined, GEMINI_MODEL: "gemini-3.5-flash" });
  try {
    await answerQuestion({ question: "My refund is $1,234 and my SSN is 123-45-6789. What is a W-2?", context: GENERAL_CONTEXT, bankingTools: false, channel: "message" });
  } finally {
    restore();
    cap.stop();
  }
  const logs = cap.lines().map((l) => JSON.parse(l) as Record<string, unknown>);
  const entry = logs.find((l) => l.event === "ai.model");
  assert.ok(entry, "an ai.model diagnostic is logged");
  assert.equal(entry.path, "imessage-advisor");
  assert.equal(entry.requestedModel, "gemini-3.5-flash");
  assert.equal(entry.modelSource, "GEMINI_MODEL");
  assert.equal(entry.answeredBy, "offline-guides");
  const all = JSON.stringify(logs);
  assert.doesNotMatch(all, /1,234|123-45-6789|What is a W-2/);
});

test("web and iMessage advisors send GEMINI_MODEL to the Gemini API and report the serving model", async () => {
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    urls.push(req.url);
    const body = { candidates: [{ content: { role: "model", parts: [{ text: "A W-2 reports your wages and tax withheld." }] }, finishReason: "STOP" }], modelVersion: "gemini-3.5-flash-001" };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const cap = captureLogs();
  const restore = setEnv({ GEMINI_API_KEY: "test-key-not-real", GEMINI_MODEL: "gemini-3.5-flash", GEMINI_USE_VERTEX: undefined, GOOGLE_GENAI_USE_VERTEXAI: undefined });
  try {
    for (const channel of ["web", "message"] as const) {
      const r = await answerQuestion({ question: "What is a W-2?", context: GENERAL_CONTEXT, bankingTools: false, channel });
      assert.equal(r.mode, "gemini");
      assert.equal(r.model, "gemini-3.5-flash");
      assert.equal(r.servedBy, "gemini-3.5-flash-001");
    }
  } finally {
    restore();
    cap.stop();
    globalThis.fetch = realFetch;
  }
  assert.equal(urls.length, 2);
  assert.ok(urls.every((u) => u.includes("/models/gemini-3.5-flash:generateContent")), urls.join("\n"));
  assert.ok(urls.every((u) => !u.includes("test-key-not-real")), "key is sent as a header, not in the URL");
  const logs = cap.lines().map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.event === "ai.model");
  assert.deepEqual(logs.map((l) => [l.path, l.answeredBy, l.requestedModel, l.servedBy]), [
    ["web-advisor", "gemini", "gemini-3.5-flash", "gemini-3.5-flash-001"],
    ["imessage-advisor", "gemini", "gemini-3.5-flash", "gemini-3.5-flash-001"],
  ]);
  assert.doesNotMatch(cap.lines().join("\n"), /test-key-not-real|reports your wages/);
});
