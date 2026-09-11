/**
 * Safe arithmetic expression parser for BQ numeric field inputs.
 *
 * Estimators can type shorthand like `=15000*3` or `0.5*80000` in any
 * numeric inline-edit field (qty, harga, koefisien, etc.) and have the
 * expression evaluated to a canonical decimal before the value is sent to
 * the server.
 *
 * Grammar: expr = term (("+" | "-") term)*
 *          term = factor (("*" | "/") factor)*
 *          factor = decimal_literal
 *
 * A leading `=` is accepted and stripped. Whitespace is ignored.
 * No parentheses, functions, or exponents are supported — intentionally
 * minimal so there is no code-execution surface.
 *
 * All arithmetic uses `@platform/utilities/decimal` (BigInt-backed exact
 * decimal) — never JavaScript floating-point.
 */

import {
  addDecimals,
  divideDecimals,
  multiplyDecimals,
  toDecimalString,
  type DecimalString,
} from "@platform/utilities/decimal";

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

type NumToken = { t: "n"; v: DecimalString };
type OpToken  = { t: "o"; v: "+" | "-" | "*" | "/" };
type Token    = NumToken | OpToken;

const OP_CHARS = new Set<string>(["+", "-", "*", "/"]);

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(raw: string): Token[] | null {
  // Strip optional leading `=` and all whitespace.
  const s = (raw.startsWith("=") ? raw.slice(1) : raw).replace(/\s+/g, "");
  if (!s) return null;

  const tokens: Token[] = [];
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (/\d/.test(ch) || ch === ".") {
      // Unsigned decimal literal
      let j = i;
      while (j < s.length && /[\d.]/.test(s[j])) j++;
      const raw = s.slice(i, j);
      try {
        tokens.push({ t: "n", v: toDecimalString(raw) });
      } catch {
        return null; // e.g. "1.2.3" — malformed
      }
      i = j;
      continue;
    }

    if (OP_CHARS.has(ch)) {
      // Unary sign: `-` or `+` immediately after start or another operator
      const lastIsOp =
        tokens.length === 0 || tokens[tokens.length - 1].t === "o";
      if ((ch === "-" || ch === "+") && lastIsOp) {
        // Absorb the sign into the following number.
        let j = i + 1;
        if (j >= s.length || !/[\d.]/.test(s[j])) return null;
        while (j < s.length && /[\d.]/.test(s[j])) j++;
        const raw = ch + s.slice(i + 1, j);
        try {
          tokens.push({ t: "n", v: toDecimalString(raw) });
        } catch {
          return null;
        }
        i = j;
        continue;
      }
      tokens.push({ t: "o", v: ch as "+" | "-" | "*" | "/" });
      i++;
      continue;
    }

    return null; // Unknown character — reject the whole expression.
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function negate(v: DecimalString): DecimalString {
  if (v === "0") return v;
  return (v.startsWith("-") ? v.slice(1) : `-${v}`) as DecimalString;
}

/**
 * Evaluates a flat, already-validated token list with standard precedence
 * (* / before + -).
 *
 * Precondition: tokens must match the pattern `n (o n)*`.
 */
function evaluate(tokens: Token[]): DecimalString | null {
  if (tokens.length === 0) return null;
  // Must start with a number and alternate n/o.
  for (let k = 0; k < tokens.length; k++) {
    if (k % 2 === 0 && tokens[k].t !== "n") return null;
    if (k % 2 === 1 && tokens[k].t !== "o") return null;
  }
  if (tokens.length % 2 === 0) return null; // must end on a number

  // Single-number short-circuit.
  if (tokens.length === 1) return (tokens[0] as NumToken).v;

  // First pass — fold `*` and `/` (higher precedence).
  // Build a reduced list of DecimalStrings interleaved with "+" | "-" operators.
  type Atom = DecimalString | "+" | "-";
  const atoms: Atom[] = [(tokens[0] as NumToken).v];

  for (let i = 1; i < tokens.length; i += 2) {
    const op  = (tokens[i] as OpToken).v;
    const rhs = (tokens[i + 1] as NumToken).v;

    if (op === "*" || op === "/") {
      const lhs = atoms.pop() as DecimalString;
      let result: DecimalString;
      try {
        // Division keeps 10 fractional places — precise enough for BQ input;
        // server-side storage precision takes over from there.
        result =
          op === "*"
            ? multiplyDecimals(lhs, rhs)
            : divideDecimals(lhs, rhs, 10);
      } catch {
        return null; // e.g. division by zero
      }
      atoms.push(result);
    } else {
      // "+" or "-" — deferred to second pass
      atoms.push(op as "+" | "-", rhs);
    }
  }

  // Second pass — fold `+` and `-` (lower precedence).
  if (atoms.length === 0 || atoms[0] === "+" || atoms[0] === "-") return null;
  let acc = atoms[0] as DecimalString;
  for (let j = 1; j < atoms.length; j += 2) {
    const op  = atoms[j] as "+" | "-";
    const rhs = atoms[j + 1] as DecimalString;
    try {
      acc =
        op === "+"
          ? addDecimals(acc, rhs)
          : addDecimals(acc, negate(rhs));
    } catch {
      return null;
    }
  }

  return acc;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves a calculator expression (or plain decimal) to a canonical decimal
 * string.  Returns `null` when the input cannot be parsed.
 *
 * @example
 *   resolveCalcExpression("=15000*3")   // "45000"
 *   resolveCalcExpression("0.5*80000")  // "40000"
 *   resolveCalcExpression("1200+800")   // "2000"
 *   resolveCalcExpression("1/3")        // "0.3333333333"
 *   resolveCalcExpression("1500")       // "1500"
 *   resolveCalcExpression("abc")        // null
 */
export function resolveCalcExpression(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Plain decimal literal — no operator present after stripping leading sign
  // (and optional `=`).
  const body =
    trimmed.startsWith("=")
      ? trimmed.slice(1).trim()
      : trimmed.startsWith("-") || trimmed.startsWith("+")
        ? trimmed.slice(1)
        : trimmed;

  const isExpr =
    trimmed.startsWith("=") || /[-+*/]/.test(body);

  if (!isExpr) {
    try {
      return toDecimalString(trimmed);
    } catch {
      return null;
    }
  }

  const tokens = tokenize(trimmed);
  if (!tokens || tokens.length === 0) return null;

  return evaluate(tokens);
}
