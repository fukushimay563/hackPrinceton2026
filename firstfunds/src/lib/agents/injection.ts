// Prompt-injection screening for uploaded documents. Documents are DATA: the
// extractor only reads labelled box lines, and any instruction-like text is
// flagged, removed from what a model could see, and reported to the verifier.

const PATTERNS: RegExp[] = [
  /ignore (all |any |the )?(previous|prior|above|earlier) (instructions|prompts|rules)/i,
  /disregard (all |any |the )?(previous|prior|above|system)/i,
  /\b(system|developer) prompt\b/i,
  /\byou are now\b/i,
  /\bact as\b/i,
  /\bnote to (the )?(ai|assistant|model|llm)\b/i,
  /\b(report|say|set|claim)\b.{0,40}\b(refund|wages|withheld|tax)\b.{0,20}(\$|\d)/i,
  /<\/?(system|assistant|instructions?)>/i,
  /\bassistant:\s/i,
];

export type ScreenResult = { clean: string; flaggedLines: number[]; flagged: boolean };

export function screenDocumentText(text: string): ScreenResult {
  const lines = text.split(/\r?\n/);
  const flaggedLines: number[] = [];
  const kept = lines.map((line, i) => {
    if (PATTERNS.some((p) => p.test(line))) {
      flaggedLines.push(i + 1);
      return "[removed: instruction-like text]";
    }
    return line;
  });
  return { clean: kept.join("\n"), flaggedLines, flagged: flaggedLines.length > 0 };
}
