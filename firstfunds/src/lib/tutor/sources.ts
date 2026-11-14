import { CORPUS, type SourceDoc } from "./corpus";
import { retrieve } from "./retrieve";

// Make sure the sources the answer most likely needs are in the set.
const INTENT_DOCS: [RegExp, string[]][] = [
  [/(upload|add|scan|photo|picture).*(w-?2|document|form)|w-?2.*(upload|add)|how do i (start|do) my tax/, ["help-upload"]],
  [/(delete|remove|erase) my|privacy|private|is my (data|info)|who can see|stored|store my|save my data/, ["help-privacy"]],
  [/\b(sign ?in|log ?in|account|password|magic link|guest|sync|other device)\b/, ["help-account"]],
  [/(file|submit|send).*(irs|return|taxes)|e-?file|does (this|firstfunds|finpilot) file/, ["help-filing"]],
  [/(support|can you handle|can't handle|not supported|freelance|1099|married|dependents? (on|in) my return)/, ["help-scope"]],
  [/\b(academy|how do (lessons|quizzes) work|xp|badges?)\b/, ["help-academy"]],
  [/(what (is|does) (finpilot|firstfunds|this app)|what can you do|help me use|how does (this|the app) work|features)/, ["help-overview"]],
  [/interest|apr|so much/, ["apr-interest", "minimum-payments", "app-method"]],
  [/minimum|pay off|payoff|how long/, ["minimum-payments", "app-method"]],
  [/utiliz|score|limit/, ["utilization"]],
  [/refund|owe|withh/, ["refund-withholding", "std-ded-2025", "tax-table"]],
  [/deduction|standard/, ["std-ded-2025", "dependent-std"]],
  [/bracket|marginal|effective/, ["brackets-2025"]],
  [/paycheck|take.?home|fica|social security|medicare/, ["fica", "refund-withholding"]],
  [/file|filing|free/, ["free-file"]],
];

export function gatherSources(question: string): SourceDoc[] {
  const q = question.toLowerCase();
  const forced = INTENT_DOCS.filter(([re]) => re.test(q)).flatMap(([, ids]) => ids);
  const byId = new Map(CORPUS.map((d) => [d.id, d]));
  const out: SourceDoc[] = [];
  for (const id of forced) {
    const d = byId.get(id);
    if (d && !out.includes(d)) out.push(d);
  }
  for (const d of retrieve(question, forced.length ? 1 : 4)) if (!out.includes(d)) out.push(d);
  return out.slice(0, 5);
}

