// Path <-> hash mapping for the single-file build (artifact pages only allow #name).
export const PATH_TO_HASH: Record<string, string> = {
  "/": "home",
  "/advisor": "advisor",
  "/paycheck": "paycheck",
  "/credit": "credit",
  "/taxes": "taxes",
  "/taxes/classic": "taxes-classic",
  "/academy": "academy",
  "/finpilot": "finpilot",
  "/account": "account",
  "/methodology": "methodology",
};
export const HASH_TO_PATH: Record<string, string> = Object.fromEntries(Object.entries(PATH_TO_HASH).map(([p, h]) => [h, p]));

export function toHash(path: string) {
  if (/^https?:|^mailto:|^#/.test(path)) return path;
  return `#${PATH_TO_HASH[path] ?? "home"}`;
}
export function currentPath() {
  const h = typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "");
  return HASH_TO_PATH[h] ?? "/";
}
