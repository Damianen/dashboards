// Pull a JSON value out of free-form text. LLMs wrap their replies in ```json
// fences, prepend prose, or trail a closing remark; this finds the first balanced
// object/array and parses it. Dependency-free so it stays usable from any layer.

const FENCE = /```(?:json)?\s*([\s\S]*?)```/i;

/**
 * Extract and parse the first JSON object or array embedded in `text`.
 *
 * Prefers the contents of a fenced ```json … ``` (or bare ``` … ```) block; if
 * there is no fence, scans the whole string. From the chosen candidate it locates
 * the first `{`/`[` and walks forward — string- and escape-aware so braces inside
 * quoted values don't count — until the matching close balances out, then
 * `JSON.parse`s that span. Throws if no JSON can be found or parsed.
 */
export function extractJson(text: string): unknown {
  const fenced = FENCE.exec(text);
  const candidate = fenced?.[1] ?? text;

  const span = firstBalancedSpan(candidate) ?? firstBalancedSpan(text);
  if (span === null) throw new Error("no JSON found in text");

  try {
    return JSON.parse(span);
  } catch {
    throw new Error("no JSON found in text");
  }
}

/** Slice the first balanced {...} or [...] from `s`, or null if there is none. */
function firstBalancedSpan(s: string): string | null {
  const start = firstOpener(s);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }

  return null;
}

/** Index of the first `{` or `[`, or -1. */
function firstOpener(s: string): number {
  const obj = s.indexOf("{");
  const arr = s.indexOf("[");
  if (obj === -1) return arr;
  if (arr === -1) return obj;
  return Math.min(obj, arr);
}
