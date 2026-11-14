// True in the single-file hosted build (no server: no API routes, no downloads).
export const IS_STATIC = process.env.NEXT_PUBLIC_STATIC === "1";
