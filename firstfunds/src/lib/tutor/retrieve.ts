// Tiny TF-IDF retriever over the grounding corpus. No network, no embeddings
// service — deterministic and demo-safe. Swap for LangChain + a vector store later
// without changing the API route's contract.
import { CORPUS, type SourceDoc } from "./corpus";

const STOP = new Set(
  "a an the and or of to in on for is are am i my me you your it this that what why how do does did can with be if at by from as so much many".split(" "),
);

const SYNONYMS: Record<string, string[]> = {
  interest: ["apr", "rate"],
  apr: ["interest"],
  refund: ["withholding", "withheld"],
  owe: ["withholding", "refund"],
  utilization: ["limit", "score"],
  score: ["utilization", "credit"],
  minimum: ["payment", "minimum"],
  deduction: ["standard"],
  paycheck: ["fica", "withholding", "social", "medicare"],
  bracket: ["marginal", "rate"],
  file: ["free", "filing"],
};

function tokenize(s: string) {
  return s
    .toLowerCase()
    .replace(/\bw-?(2|4)\b/g, "w$1") // keep form names (W-2, W-4) as one token
    .replace(/[^a-z0-9$%. ]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/[.]+$/, ""))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

const docTokens = CORPUS.map((d) => tokenize(`${d.title} ${d.text}`));
const df = new Map<string, number>();
for (const toks of docTokens) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
const N = CORPUS.length;
const idf = (t: string) => Math.log(1 + N / (1 + (df.get(t) ?? 0)));

export function retrieve(query: string, k = 4, topicHint?: SourceDoc["topic"]): SourceDoc[] {
  const q = tokenize(query);
  const expanded = [...q, ...q.flatMap((t) => SYNONYMS[t] ?? [])];
  const scored = CORPUS.map((doc, i) => {
    const toks = docTokens[i];
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const t of expanded) score += ((tf.get(t) ?? 0) / toks.length) * idf(t);
    if (topicHint && doc.topic === topicHint) score *= 1.25;
    return { doc, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.doc);
}
