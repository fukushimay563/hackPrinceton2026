"use client";
import { useRef, useState } from "react";
import { Camera, FileText, Keyboard, Plus, RotateCcw, Trash2 } from "lucide-react";
import { exclusionMessage, SUPPORTED_TAX_YEAR } from "@/lib/minimizer/documents";
import { makeDocument, SAMPLES } from "@/lib/minimizer/samples";
import type { StepResult } from "@/lib/minimizer/graph";
import type { DocFields, FilingEvent, TaxDocument } from "@/lib/minimizer/types";
import { IS_STATIC } from "@/lib/runtime";
import { cn } from "@/components/ui";
import { AssistantLine } from "./QuestionCard";

const usd = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "—";

export function DocSummary({ d }: { d: TaxDocument }) {
  return d.kind === "1099-NEC" ? (
    <span>Box 1 {usd(d.fields.nonemployeeComp)}</span>
  ) : (
    <span>
      Wages {usd(d.fields.wages)} · Withheld {usd(d.fields.federalWithheld)}
    </span>
  );
}

export function DocumentsStep({
  res,
  send,
}: {
  res: StepResult;
  send: (e: FilingEvent, busy?: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [manual, setManual] = useState<null | { note?: string }>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const ACCEPT = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
  const docs = res.profile.documents;
  const docsReady = res.profile.answers["basics.docsReady"]?.value;
  const counted = docs.filter((d) => !d.excluded);

  async function onFile(file: File) {
    setUploadErr(null);
    if (fileRef.current) fileRef.current.value = "";
    if (!ACCEPT.includes(file.type)) {
      setUploadErr(`“${file.name.slice(0, 40)}” isn't a supported file. Use a photo (PNG, JPG, WebP) or a PDF of your W-2.`);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setUploadErr("That file is over 8 MB. Try a smaller photo or a PDF.");
      return;
    }
    if (IS_STATIC) {
      setManual({ note: `We can't read photos in this preview, so type the numbers from “${file.name.slice(0, 40)}”. It takes about 30 seconds.` });
      return;
    }
    setReading(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/w2-extract", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const f = d.fields;
      const doc = makeDocument({
        kind: "W-2",
        payer: f.employerName || "Your employer",
        payerIdLast4: f.employerEinLast4,
        taxYear: f.taxYear,
        origin: "upload",
        fields: {
          wages: f.box1Wages,
          federalWithheld: f.box2FederalWithheld,
          ssWages: f.box3SocialSecurityWages,
          ssWithheld: f.box4SocialSecurityWithheld,
          medicareWages: f.box5MedicareWages,
          medicareWithheld: f.box6MedicareWithheld,
        },
      });
      send({ type: "addDocument", doc }, "Checking your documents…");
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "We couldn't read that file.");
      setManual({});
    } finally {
      setReading(null);
    }
  }

  return (
    <div>
      <AssistantLine
        text={
          counted.length
            ? `Got ${counted.length} document${counted.length > 1 ? "s" : ""}. Add any others, or continue.`
            : docsReady === "no"
              ? "No problem. You can type the numbers in, or come back later. Your progress is saved in this tab."
              : null
        }
      />
      <h2 className="text-2xl leading-tight font-semibold tracking-tight sm:text-[28px]">Add your tax documents</h2>
      <p className="mt-2 text-ink-2">Your W-2 from each job. We&apos;ll read the numbers so you don&apos;t have to type them.</p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={cn("mt-6 rounded-2xl border-2 border-dashed p-2 transition-colors", dragOver ? "border-brand bg-brand-soft" : "border-transparent")}
      >
        {reading ? (
          <div className="flex min-h-20 w-full flex-col justify-center gap-2 rounded-2xl border border-line bg-card px-5" role="status" aria-live="polite">
            <div className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} className="text-brand" /> Reading “{reading.slice(0, 40)}”…</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="skeleton h-1.5 w-full" /></div>
            <div className="text-xs text-ink-3">Finding wages, withholding and employer details. You&apos;ll confirm every number next.</div>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full min-h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-ink px-5 py-3 text-paper transition-transform hover:bg-ink-2 active:scale-[0.99]"
          >
            <span className="flex items-center gap-3 text-lg font-semibold"><Camera size={22} /> Upload a W-2</span>
            <span className="text-xs text-paper/70">or drag and drop a photo or PDF here</span>
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <button
        onClick={() => setManual({})}
        className="mt-3 flex w-full min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card text-base font-semibold hover:border-ink-3"
      >
        <Keyboard size={18} /> Type it in instead
      </button>
      {uploadErr && <p role="alert" className="mt-3 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-ink">{uploadErr}</p>}

      {manual && <ManualEntry note={manual.note} onCancel={() => setManual(null)} onSave={(doc) => { setManual(null); send({ type: "addDocument", doc }, "Checking your documents…"); }} />}

      {docs.length > 0 && (
        <ul className="mt-6 space-y-2" aria-label="Your documents">
          {docs.map((d) => {
            const msg = exclusionMessage(d);
            return (
              <li key={d.id} className={cn("rounded-2xl border p-4", d.excluded ? "border-dashed border-line bg-paper" : "border-line bg-card")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold">
                      <FileText size={16} className="shrink-0 text-brand" />
                      <span className="truncate">{d.label}</span>
                    </div>
                    <div className="num mt-1 text-sm text-ink-2">
                      <DocSummary d={d} />
                    </div>
                    {msg && <p className="mt-2 text-sm text-warn">{msg}</p>}
                    {d.excluded?.reason === "duplicate" && (
                      <button onClick={() => send({ type: "restoreDocument", docId: d.id })} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-info hover:underline">
                        <RotateCcw size={13} /> It&apos;s a different W-2
                      </button>
                    )}
                  </div>
                  <button onClick={() => send({ type: "removeDocument", docId: d.id })} aria-label={`Remove ${d.label}`} className="rounded-lg p-2 text-ink-3 hover:bg-ink/5 hover:text-debt">
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6">
        <div className="text-xs font-semibold tracking-wide text-ink-3 uppercase">No documents handy? Try a sample</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s.key}
              onClick={() => send({ type: "addDocument", doc: s.build() }, "Checking your documents…")}
              className="rounded-xl border border-line bg-card p-3 text-left hover:border-brand"
            >
              <div className="flex items-center gap-1 text-sm font-semibold">
                <Plus size={14} className="shrink-0 text-brand" /> <span className="truncate">{s.title}</span>
              </div>
              <div className="mt-0.5 text-xs text-ink-3">{s.note}</div>
            </button>
          ))}
        </div>
      </div>

      <button
        disabled={docs.length === 0}
        onClick={() => send({ type: "uploadsDone", done: true }, "Checking your documents…")}
        className="sticky bottom-4 mt-6 w-full min-h-14 rounded-2xl bg-brand text-base font-semibold text-on-brand shadow-lg hover:bg-brand-2 disabled:opacity-40 disabled:shadow-none"
      >
        I&apos;ve added everything
      </button>
    </div>
  );
}

function ManualEntry({ note, onSave, onCancel }: { note?: string; onSave: (d: TaxDocument) => void; onCancel: () => void }) {
  const [payer, setPayer] = useState("");
  const [year, setYear] = useState(SUPPORTED_TAX_YEAR);
  const [wages, setWages] = useState("");
  const [withheld, setWithheld] = useState("");
  const valid = payer.trim() && wages !== "" && Number(wages) >= 0 && (withheld === "" || Number(withheld) >= 0);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        const doc = makeDocument({
          kind: "W-2",
          payer: payer.trim().slice(0, 60),
          taxYear: year,
          origin: "manual",
          fields: { wages: Number(wages), federalWithheld: withheld === "" ? null : Number(withheld) },
        });
        onSave({ ...doc, confirmed: true }); // typed by the user: already confirmed
      }}
      className="mt-4 space-y-3 rounded-2xl border border-line bg-card p-4"
    >
      {note && <p className="rounded-xl bg-info-soft px-3 py-2 text-sm">{note}</p>}
      <Field label="Employer name (box c)">
        <input value={payer} onChange={(e) => setPayer(e.target.value)} className="w-full bg-transparent py-3 outline-none" placeholder="e.g. Brightline Media" />
      </Field>
      <Field label="Tax year (top of the form)">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-full bg-transparent py-3 outline-none">
          <option value={2025}>2025</option>
          <option value={2024}>2024</option>
        </select>
      </Field>
      <Field label="Box 1 · Wages, tips, other compensation">
        <input type="number" inputMode="decimal" min={0} value={wages} onChange={(e) => setWages(e.target.value)} className="num w-full bg-transparent py-3 outline-none" placeholder="0.00" />
      </Field>
      <Field label="Box 2 · Federal income tax withheld (leave blank if empty)">
        <input type="number" inputMode="decimal" min={0} value={withheld} onChange={(e) => setWithheld(e.target.value)} className="num w-full bg-transparent py-3 outline-none" placeholder="0.00" />
      </Field>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="min-h-12 flex-1 rounded-xl border border-line font-semibold">
          Cancel
        </button>
        <button type="submit" disabled={!valid} className="min-h-12 flex-1 rounded-xl bg-ink font-semibold text-paper disabled:opacity-40">
          Add W-2
        </button>
      </div>
    </form>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink-2">{label}</span>
      <div className="mt-1 rounded-xl border-2 border-line px-3 focus-within:border-brand">{children}</div>
    </label>
  );
}

/** Confirmation of values read from a document, with inline correction. */
export function ConfirmDoc({
  doc,
  index,
  total,
  onConfirm,
}: {
  doc: TaxDocument;
  index: number;
  total: number;
  onConfirm: (fields?: DocFields) => void;
}) {
  const [editing, setEditing] = useState(false);
  const isNec = doc.kind === "1099-NEC";
  const keys: [keyof DocFields, string][] = isNec
    ? [["nonemployeeComp", "Box 1 · Nonemployee compensation"], ["federalWithheld", "Box 4 · Federal tax withheld"]]
    : [["wages", "Box 1 · Wages"], ["federalWithheld", "Box 2 · Federal tax withheld"]];
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(keys.map(([k]) => [k, typeof doc.fields[k] === "number" ? String(doc.fields[k]) : ""])),
  );

  return (
    <div>
      <AssistantLine text={`I read these numbers from your ${doc.kind}. Do they match your copy?`} />
      <div className="text-sm font-medium text-ink-3">
        Document {index} of {total}
      </div>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">{doc.label}</h2>
      <dl className="mt-5 divide-y divide-line rounded-2xl border border-line bg-card">
        <Row k="From" v={doc.payer} />
        <Row k="Tax year" v={doc.taxYear ? String(doc.taxYear) : "Not found"} />
        {keys.map(([k, label]) =>
          editing ? (
            <div key={k} className="p-4">
              <Field label={label}>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={vals[k]}
                  onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
                  className="num w-full bg-transparent py-3 text-lg font-semibold outline-none"
                  placeholder="Blank"
                />
              </Field>
            </div>
          ) : (
            <Row key={k} k={label} v={typeof doc.fields[k] === "number" ? usd(doc.fields[k]) : "Not shown"} strong />
          ),
        )}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        Reading a document doesn&apos;t prove it&apos;s genuine or correct. Please compare with your paper or PDF copy.
      </p>
      <div className="mt-5 space-y-3">
        {editing ? (
          <button
            onClick={() => onConfirm(Object.fromEntries(keys.map(([k]) => [k, vals[k] === "" ? null : Number(vals[k])])) as DocFields)}
            className="w-full min-h-14 rounded-2xl bg-ink text-base font-semibold text-paper"
          >
            Save these numbers
          </button>
        ) : (
          <>
            <button onClick={() => onConfirm()} className="w-full min-h-14 rounded-2xl bg-ink text-base font-semibold text-paper">
              Yes, that&apos;s right
            </button>
            <button onClick={() => setEditing(true)} className="w-full min-h-14 rounded-2xl border-2 border-line bg-card text-base font-semibold hover:border-ink-3">
              Fix a number
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <dt className="text-sm text-ink-2">{k}</dt>
      <dd className={cn("num text-right", strong ? "text-lg font-semibold" : "font-medium")}>{v}</dd>
    </div>
  );
}
