/**
 * texmath.js — a small, dependency-free LaTeX-math converter.
 *
 * Parses a (best-effort) subset of LaTeX math into an AST and renders it to:
 *   - Presentation MathML        → GEP.texmath.toMathML(tex, display)
 *   - Office Math (OMML, Word)    → GEP.texmath.toOMML(tex, display)
 *   - Readable Unicode text       → GEP.texmath.toUnicode(tex)
 *
 * Coverage targets the constructs found in Gemini Deep Research reports:
 * super/subscripts, fractions, roots, big operators (∑ ∫ ∏ …) with limits,
 * Greek letters, relations/operators, \text, function names, spacing and
 * \left…\right fences. Anything unrecognised degrades to plain text so a
 * conversion never throws.
 */
(function () {
  "use strict";
  const GEP = (window.GEP = window.GEP || {});

  // ---- symbol tables -----------------------------------------------------
  // name -> { ml: unicode, cls: "mi" | "mo" }  (the `typ` field is legacy/unused)
  const SYM = {
    // lowercase greek
    alpha: { ml: "\u03b1", typ: "alpha", cls: "mi" },
    beta: { ml: "\u03b2", typ: "beta", cls: "mi" },
    gamma: { ml: "\u03b3", typ: "gamma", cls: "mi" },
    delta: { ml: "\u03b4", typ: "delta", cls: "mi" },
    epsilon: { ml: "\u03f5", typ: "epsilon", cls: "mi" },
    varepsilon: { ml: "\u03b5", typ: "epsilon.alt", cls: "mi" },
    zeta: { ml: "\u03b6", typ: "zeta", cls: "mi" },
    eta: { ml: "\u03b7", typ: "eta", cls: "mi" },
    theta: { ml: "\u03b8", typ: "theta", cls: "mi" },
    vartheta: { ml: "\u03d1", typ: "theta.alt", cls: "mi" },
    iota: { ml: "\u03b9", typ: "iota", cls: "mi" },
    kappa: { ml: "\u03ba", typ: "kappa", cls: "mi" },
    lambda: { ml: "\u03bb", typ: "lambda", cls: "mi" },
    mu: { ml: "\u03bc", typ: "mu", cls: "mi" },
    nu: { ml: "\u03bd", typ: "nu", cls: "mi" },
    xi: { ml: "\u03be", typ: "xi", cls: "mi" },
    omicron: { ml: "\u03bf", typ: "omicron", cls: "mi" },
    pi: { ml: "\u03c0", typ: "pi", cls: "mi" },
    varpi: { ml: "\u03d6", typ: "pi.alt", cls: "mi" },
    rho: { ml: "\u03c1", typ: "rho", cls: "mi" },
    varrho: { ml: "\u03f1", typ: "rho.alt", cls: "mi" },
    sigma: { ml: "\u03c3", typ: "sigma", cls: "mi" },
    varsigma: { ml: "\u03c2", typ: "sigma.alt", cls: "mi" },
    tau: { ml: "\u03c4", typ: "tau", cls: "mi" },
    upsilon: { ml: "\u03c5", typ: "upsilon", cls: "mi" },
    phi: { ml: "\u03d5", typ: "phi", cls: "mi" },
    varphi: { ml: "\u03c6", typ: "phi.alt", cls: "mi" },
    chi: { ml: "\u03c7", typ: "chi", cls: "mi" },
    psi: { ml: "\u03c8", typ: "psi", cls: "mi" },
    omega: { ml: "\u03c9", typ: "omega", cls: "mi" },
    // uppercase greek
    Gamma: { ml: "\u0393", typ: "Gamma", cls: "mi" },
    Delta: { ml: "\u0394", typ: "Delta", cls: "mi" },
    Theta: { ml: "\u0398", typ: "Theta", cls: "mi" },
    Lambda: { ml: "\u039b", typ: "Lambda", cls: "mi" },
    Xi: { ml: "\u039e", typ: "Xi", cls: "mi" },
    Pi: { ml: "\u03a0", typ: "Pi", cls: "mi" },
    Sigma: { ml: "\u03a3", typ: "Sigma", cls: "mi" },
    Upsilon: { ml: "\u03a5", typ: "Upsilon", cls: "mi" },
    Phi: { ml: "\u03a6", typ: "Phi", cls: "mi" },
    Psi: { ml: "\u03a8", typ: "Psi", cls: "mi" },
    Omega: { ml: "\u03a9", typ: "Omega", cls: "mi" },
    // binary operators / relations
    times: { ml: "\u00d7", typ: "times", cls: "mo" },
    div: { ml: "\u00f7", typ: "div", cls: "mo" },
    cdot: { ml: "\u22c5", typ: "dot.op", cls: "mo" },
    pm: { ml: "\u00b1", typ: "plus.minus", cls: "mo" },
    mp: { ml: "\u2213", typ: "minus.plus", cls: "mo" },
    ast: { ml: "\u2217", typ: "ast", cls: "mo" },
    star: { ml: "\u22c6", typ: "star.op", cls: "mo" },
    circ: { ml: "\u2218", typ: "compose", cls: "mo" },
    bullet: { ml: "\u2219", typ: "bullet", cls: "mo" },
    oplus: { ml: "\u2295", typ: "plus.circle", cls: "mo" },
    ominus: { ml: "\u2296", typ: "minus.circle", cls: "mo" },
    otimes: { ml: "\u2297", typ: "times.circle", cls: "mo" },
    wedge: { ml: "\u2227", typ: "and", cls: "mo" },
    vee: { ml: "\u2228", typ: "or", cls: "mo" },
    leq: { ml: "\u2264", typ: "lt.eq", cls: "mo" },
    le: { ml: "\u2264", typ: "lt.eq", cls: "mo" },
    geq: { ml: "\u2265", typ: "gt.eq", cls: "mo" },
    ge: { ml: "\u2265", typ: "gt.eq", cls: "mo" },
    neq: { ml: "\u2260", typ: "eq.not", cls: "mo" },
    ne: { ml: "\u2260", typ: "eq.not", cls: "mo" },
    equiv: { ml: "\u2261", typ: "equiv", cls: "mo" },
    approx: { ml: "\u2248", typ: "approx", cls: "mo" },
    cong: { ml: "\u2245", typ: "tilde.equiv", cls: "mo" },
    sim: { ml: "\u223c", typ: "tilde.op", cls: "mo" },
    simeq: { ml: "\u2243", typ: "tilde.eq", cls: "mo" },
    propto: { ml: "\u221d", typ: "prop", cls: "mo" },
    ll: { ml: "\u226a", typ: "lt.double", cls: "mo" },
    gg: { ml: "\u226b", typ: "gt.double", cls: "mo" },
    to: { ml: "\u2192", typ: "arrow.r", cls: "mo" },
    rightarrow: { ml: "\u2192", typ: "arrow.r", cls: "mo" },
    Rightarrow: { ml: "\u21d2", typ: "arrow.r.double", cls: "mo" },
    leftarrow: { ml: "\u2190", typ: "arrow.l", cls: "mo" },
    Leftarrow: { ml: "\u21d0", typ: "arrow.l.double", cls: "mo" },
    leftrightarrow: { ml: "\u2194", typ: "arrow.l.r", cls: "mo" },
    mapsto: { ml: "\u21a6", typ: "arrow.r.bar", cls: "mo" },
    implies: { ml: "\u27f9", typ: "arrow.r.double.long", cls: "mo" },
    Longrightarrow: { ml: "\u27f9", typ: "arrow.r.double.long", cls: "mo" },
    impliedby: { ml: "\u27f8", typ: "arrow.l.double.long", cls: "mo" },
    Longleftarrow: { ml: "\u27f8", typ: "arrow.l.double.long", cls: "mo" },
    iff: { ml: "\u27fa", typ: "arrow.l.r.double.long", cls: "mo" },
    Longleftrightarrow: { ml: "\u27fa", typ: "arrow.l.r.double.long", cls: "mo" },
    longrightarrow: { ml: "\u27f6", typ: "arrow.r.long", cls: "mo" },
    longleftarrow: { ml: "\u27f5", typ: "arrow.l.long", cls: "mo" },
    infty: { ml: "\u221e", typ: "infinity", cls: "mi" },
    partial: { ml: "\u2202", typ: "partial", cls: "mi" },
    nabla: { ml: "\u2207", typ: "nabla", cls: "mi" },
    forall: { ml: "\u2200", typ: "forall", cls: "mo" },
    exists: { ml: "\u2203", typ: "exists", cls: "mo" },
    neg: { ml: "\u00ac", typ: "not", cls: "mo" },
    lnot: { ml: "\u00ac", typ: "not", cls: "mo" },
    in: { ml: "\u2208", typ: "in", cls: "mo" },
    notin: { ml: "\u2209", typ: "in.not", cls: "mo" },
    ni: { ml: "\u220b", typ: "in.rev", cls: "mo" },
    subset: { ml: "\u2282", typ: "subset", cls: "mo" },
    subseteq: { ml: "\u2286", typ: "subset.eq", cls: "mo" },
    supset: { ml: "\u2283", typ: "supset", cls: "mo" },
    supseteq: { ml: "\u2287", typ: "supset.eq", cls: "mo" },
    cup: { ml: "\u222a", typ: "union", cls: "mo" },
    cap: { ml: "\u2229", typ: "sect", cls: "mo" },
    emptyset: { ml: "\u2205", typ: "nothing", cls: "mi" },
    setminus: { ml: "\u2216", typ: "without", cls: "mo" },
    cdots: { ml: "\u22ef", typ: "dots.h.c", cls: "mo" },
    ldots: { ml: "\u2026", typ: "dots.h", cls: "mo" },
    dots: { ml: "\u2026", typ: "dots.h", cls: "mo" },
    vdots: { ml: "\u22ee", typ: "dots.v", cls: "mo" },
    ddots: { ml: "\u22f1", typ: "dots.down", cls: "mo" },
    angle: { ml: "\u2220", typ: "angle", cls: "mi" },
    perp: { ml: "\u22a5", typ: "perp", cls: "mo" },
    parallel: { ml: "\u2225", typ: "parallel", cls: "mo" },
    prime: { ml: "\u2032", typ: "prime", cls: "mo" },
    hbar: { ml: "\u210f", typ: "planck.reduce", cls: "mi" },
    ell: { ml: "\u2113", typ: "ell", cls: "mi" },
    Re: { ml: "\u211c", typ: "Re", cls: "mi" },
    Im: { ml: "\u2111", typ: "Im", cls: "mi" },
    aleph: { ml: "\u2135", typ: "aleph", cls: "mi" },
    langle: { ml: "\u27e8", typ: "angle.l", cls: "mo" },
    rangle: { ml: "\u27e9", typ: "angle.r", cls: "mo" },
    dagger: { ml: "\u2020", typ: "dagger", cls: "mo" },
  };

  // big operators: name -> { ml, typ, under } (under=true ⇒ limits go under/over)
  const BIGOP = {
    sum: { ml: "\u2211", typ: "sum", under: true },
    prod: { ml: "\u220f", typ: "product", under: true },
    coprod: { ml: "\u2210", typ: "product.co", under: true },
    bigcup: { ml: "\u22c3", typ: "union.big", under: true },
    bigcap: { ml: "\u22c2", typ: "sect.big", under: true },
    bigoplus: { ml: "\u2a01", typ: "plus.circle.big", under: true },
    bigotimes: { ml: "\u2a02", typ: "times.circle.big", under: true },
    bigvee: { ml: "\u22c1", typ: "or.big", under: true },
    bigwedge: { ml: "\u22c0", typ: "and.big", under: true },
    int: { ml: "\u222b", typ: "integral", under: false },
    iint: { ml: "\u222c", typ: "integral.double", under: false },
    iiint: { ml: "\u222d", typ: "integral.triple", under: false },
    oint: { ml: "\u222e", typ: "integral.cont", under: false },
  };

  // function / operator names rendered upright; some take under-limits.
  const FUNC = new Set([
    "sin", "cos", "tan", "cot", "sec", "csc",
    "sinh", "cosh", "tanh", "coth",
    "arcsin", "arccos", "arctan",
    "log", "ln", "lg", "exp",
    "lim", "limsup", "liminf", "max", "min", "sup", "inf",
    "det", "dim", "ker", "hom", "arg", "deg", "gcd", "Pr",
  ]);
  const FUNC_UNDER = new Set(["lim", "limsup", "liminf", "max", "min", "sup", "inf", "det", "gcd", "arg", "Pr"]);

  const STYLE_CMDS = new Set([
    "mathrm", "mathbf", "mathbb", "mathcal", "mathfrak", "mathsf", "mathit", "mathtt", "boldsymbol",
  ]);
  // Delimiter-sizing prefixes (\big( \Bigg| …). They only scale the following
  // fence in real LaTeX; for our purposes they are no-ops, so we drop them
  // instead of leaking the literal command name ("bigg") into the output.
  const SIZE_CMDS = new Set([
    "big", "Big", "bigg", "Bigg", "bigl", "Bigl", "bigr", "Bigr", "bigm", "Bigm",
    "biggl", "Biggl", "biggr", "Biggr", "biggm", "Biggm", "left.", "right.",
  ]);
  const TEXT_CMDS = new Set([
    "text", "textbf", "textit", "textrm", "textsf", "texttt", "operatorname", "mbox", "hbox",
  ]);
  const ACCENTS = {
    hat: "\u005e", widehat: "\u005e", check: "\u02c7", tilde: "\u007e", widetilde: "\u007e",
    bar: "\u00af", vec: "\u2192", dot: "\u02d9", ddot: "\u00a8", acute: "\u00b4", grave: "\u0060",
  };
  const SPACES = {
    ",": "0.17em", ":": "0.22em", ";": "0.28em", "!": "-0.17em", " ": "0.25em",
    quad: "1em", qquad: "2em", thinspace: "0.17em",
  };
  const DELIMS = {
    "(": "(", ")": ")", "[": "[", "]": "]", "|": "|", ".": "",
    "\\{": "{", "\\}": "}", lbrace: "{", rbrace: "}",
    langle: "\u27e8", rangle: "\u27e9", lfloor: "\u230a", rfloor: "\u230b",
    lceil: "\u2308", rceil: "\u2309", vert: "|", Vert: "\u2016",
  };

  // ---- tokenizer ---------------------------------------------------------
  function tokenize(src) {
    const toks = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
      if (c === "\\") {
        let j = i + 1;
        if (j < n && /[a-zA-Z]/.test(src[j])) {
          let name = "";
          while (j < n && /[a-zA-Z]/.test(src[j])) { name += src[j]; j++; }
          if (TEXT_CMDS.has(name)) {
            // capture the raw braced argument verbatim (keeps spaces/turkish).
            let k = j;
            while (k < n && /\s/.test(src[k])) k++;
            if (src[k] === "{") {
              let depth = 1, raw = "";
              k++;
              while (k < n && depth > 0) {
                if (src[k] === "{") depth++;
                else if (src[k] === "}") { depth--; if (depth === 0) break; }
                raw += src[k];
                k++;
              }
              toks.push({ type: "textcmd", name, v: raw });
              i = k + 1;
              continue;
            }
          }
          toks.push({ type: "cmd", v: name });
          i = j;
          continue;
        }
        // control symbol: \, \{ \} \| \\ \  etc.
        toks.push({ type: "cmd", v: src[j] === undefined ? "" : src[j] });
        i = j + 1;
        continue;
      }
      if (c === "{") { toks.push({ type: "open" }); i++; continue; }
      if (c === "}") { toks.push({ type: "close" }); i++; continue; }
      if (c === "^") { toks.push({ type: "sup" }); i++; continue; }
      if (c === "_") { toks.push({ type: "sub" }); i++; continue; }
      if (c >= "0" && c <= "9") {
        let num = "";
        while (i < n && src[i] >= "0" && src[i] <= "9") { num += src[i]; i++; }
        if (src[i] === "." && src[i + 1] >= "0" && src[i + 1] <= "9") {
          num += ".";
          i++;
          while (i < n && src[i] >= "0" && src[i] <= "9") { num += src[i]; i++; }
        }
        toks.push({ type: "num", v: num });
        continue;
      }
      toks.push({ type: "char", v: c });
      i++;
    }
    return toks;
  }

  // ---- parser ------------------------------------------------------------
  const OPCHARS = {
    "+": "+", "-": "\u2212", "=": "=", "<": "<", ">": ">", "/": "/",
    "(": "(", ")": ")", "[": "[", "]": "]", "|": "|",
    ",": ",", ".": ".", ";": ";", ":": ":", "!": "!", "?": "?", "*": "\u2217",
    "'": "\u2032",
  };

  function charAtom(c) {
    if (/[a-zA-Z]/.test(c)) return { t: "mi", v: c };
    if (c in OPCHARS) return { t: "mo", v: OPCHARS[c] };
    return { t: "mo", v: c };
  }

  function parseArg(cur) {
    const t = cur.toks[cur.i];
    if (!t) return { t: "row", kids: [] };
    if (t.type === "open") { cur.i++; return { t: "row", kids: parseRow(cur, true) }; }
    return parseAtom(cur) || { t: "row", kids: [] };
  }

  function readDelim(cur) {
    const t = cur.toks[cur.i];
    if (!t) return "";
    if (t.type === "char") { cur.i++; return DELIMS[t.v] !== undefined ? DELIMS[t.v] : t.v; }
    if (t.type === "cmd") { cur.i++; return DELIMS[t.v] !== undefined ? DELIMS[t.v] : ""; }
    return "";
  }

  function parseAtom(cur) {
    const t = cur.toks[cur.i++];
    if (!t) return null;
    if (t.type === "num") return { t: "num", v: t.v };
    if (t.type === "open") return { t: "row", kids: parseRow(cur, true) };
    if (t.type === "textcmd") return { t: "mtext", v: t.v, bold: /bf$/.test(t.name), italic: /it$/.test(t.name) };
    if (t.type === "char") return charAtom(t.v);
    if (t.type === "cmd") return cmdAtom(t.v, cur);
    return null;
  }

  function cmdAtom(name, cur) {
    if (name === "frac" || name === "dfrac" || name === "tfrac" || name === "cfrac") {
      const num = parseArg(cur);
      const den = parseArg(cur);
      return { t: "frac", num, den };
    }
    if (name === "binom" || name === "choose") {
      const a = parseArg(cur);
      const b = parseArg(cur);
      return { t: "binom", a, b };
    }
    if (name === "sqrt") {
      let index = null;
      const t = cur.toks[cur.i];
      if (t && t.type === "char" && t.v === "[") {
        cur.i++;
        const kids = [];
        while (cur.i < cur.toks.length) {
          const u = cur.toks[cur.i];
          if (u.type === "char" && u.v === "]") { cur.i++; break; }
          kids.push(nextAtomWithScripts(cur));
        }
        index = { t: "row", kids };
      }
      return { t: "sqrt", rad: parseArg(cur), index };
    }
    if (name === "begin") return parseEnvironment(cur, readEnvName(cur));
    if (name === "end") { readEnvName(cur); return { t: "row", kids: [] }; } // stray \end
    if (SIZE_CMDS.has(name)) return { t: "row", kids: [] }; // sizing prefix → no-op
    if (STYLE_CMDS.has(name)) return { t: "styled", variant: name, kid: parseArg(cur) };
    if (name in ACCENTS) return { t: "accent", chr: ACCENTS[name], base: parseArg(cur) };
    if (name === "overline") return { t: "overline", base: parseArg(cur) };
    if (name === "underline") return { t: "underline", base: parseArg(cur) };
    if (name === "left") {
      const open = readDelim(cur);
      const inner = parseUntilRight(cur);
      return { t: "fenced", open, close: inner.close, body: { t: "row", kids: inner.kids } };
    }
    if (name === "right") return null; // handled by parseUntilRight
    if (name in BIGOP) return { t: "bigop", ml: BIGOP[name].ml, typ: BIGOP[name].typ, under: BIGOP[name].under };
    if (FUNC.has(name)) return { t: "opname", v: name, under: FUNC_UNDER.has(name) };
    if (name in SYM && SYM[name].ml) {
      const s = SYM[name];
      return { t: s.cls, v: s.ml, typ: s.typ };
    }
    if (name in SPACES || name === "," || name === ";" || name === ":" || name === "!" || name === " ") {
      return { t: "space", w: SPACES[name] || "0.25em", cmd: name };
    }
    if (name === "\\" || name === "") return { t: "space", w: "0", cmd: "break" };
    if (name === "{" ) return { t: "mo", v: "{" };
    if (name === "}") return { t: "mo", v: "}" };
    if (name === "|") return { t: "mo", v: "|" };
    if (name === "%" || name === "#" || name === "&" || name === "$" || name === "_") return { t: "mo", v: name };
    // Unknown command: show its name as upright text so nothing is lost.
    return { t: "mtext", v: name };
  }

  function maybeScripts(cur, base) {
    let sub = null, sup = null;
    while (cur.i < cur.toks.length) {
      const t = cur.toks[cur.i];
      if (t.type === "sup") { cur.i++; sup = parseArg(cur); }
      else if (t.type === "sub") { cur.i++; sub = parseArg(cur); }
      else break;
    }
    if (!sub && !sup) return base;
    const under = (base.t === "bigop" || base.t === "opname") ? base.under : false;
    if (under) return { t: "underover", base, under: sub, over: sup };
    if (sub && sup) return { t: "subsup", base, sub, sup };
    if (sup) return { t: "sup", base, exp: sup };
    return { t: "sub", base, sub };
  }

  function nextAtomWithScripts(cur) {
    const t = cur.toks[cur.i];
    let atom;
    if (t.type === "sup" || t.type === "sub") atom = { t: "row", kids: [] };
    else atom = parseAtom(cur);
    if (!atom) return { t: "row", kids: [] };
    return maybeScripts(cur, atom);
  }

  function parseRow(cur, stopClose) {
    const kids = [];
    while (cur.i < cur.toks.length) {
      const t = cur.toks[cur.i];
      if (t.type === "close") { if (stopClose) cur.i++; break; }
      if (t.type === "cmd" && t.v === "right") break;
      kids.push(nextAtomWithScripts(cur));
    }
    return kids;
  }

  function parseUntilRight(cur) {
    const kids = [];
    while (cur.i < cur.toks.length) {
      const t = cur.toks[cur.i];
      if (t.type === "cmd" && t.v === "right") { cur.i++; return { kids, close: readDelim(cur) }; }
      if (t.type === "close") break;
      kids.push(nextAtomWithScripts(cur));
    }
    return { kids, close: "" };
  }

  // Read the {name} that follows a \begin or \end. The braces are separate
  // tokens, so reassemble the env name from the chars in between (e.g. "bmatrix").
  function readEnvName(cur) {
    let name = "";
    if (cur.toks[cur.i] && cur.toks[cur.i].type === "open") {
      cur.i++;
      while (cur.i < cur.toks.length) {
        const u = cur.toks[cur.i];
        if (u.type === "close") { cur.i++; break; }
        if (u.v !== undefined) name += u.v;
        cur.i++;
      }
    }
    return name.replace(/\*$/, ""); // align*, matrix* … treat like the base env
  }

  // Parse a \begin{env}…\end{env} body into a "matrix" node: rows split on \\,
  // cells split on &. Covers matrix/pmatrix/bmatrix/…, cases, aligned, array.
  function parseEnvironment(cur, env) {
    if (env === "array") {
      // Skip the column-spec argument ({lcr}, {c|c}, …) — we don't render rules.
      if (cur.toks[cur.i] && cur.toks[cur.i].type === "open") {
        let depth = 0;
        while (cur.i < cur.toks.length) {
          const u = cur.toks[cur.i++];
          if (u.type === "open") depth++;
          else if (u.type === "close") { depth--; if (depth === 0) break; }
        }
      }
    }
    const rows = [];
    let row = [];
    let cell = [];
    const flushCell = () => { row.push({ t: "row", kids: cell }); cell = []; };
    const flushRow = () => { flushCell(); rows.push(row); row = []; };
    while (cur.i < cur.toks.length) {
      const t = cur.toks[cur.i];
      if (t.type === "cmd" && t.v === "end") { cur.i++; readEnvName(cur); break; }
      if (t.type === "cmd" && t.v === "\\") { cur.i++; flushRow(); continue; }
      if (t.type === "char" && t.v === "&") { cur.i++; flushCell(); continue; }
      if (t.type === "cmd" && t.v === "hline") { cur.i++; continue; } // table rule → ignore
      cell.push(nextAtomWithScripts(cur));
    }
    // Flush the final cell/row, then drop a trailing empty row from a closing \\.
    flushRow();
    if (rows.length > 1) {
      const last = rows[rows.length - 1];
      if (last.length === 1 && last[0].kids.length === 0) rows.pop();
    }
    return { t: "matrix", env, rows };
  }

  function parse(tex) {
    const cur = { toks: tokenize(tex), i: 0 };
    return { t: "row", kids: parseRow(cur, false) };
  }

  // ---- shared helpers ----------------------------------------------------
  function xml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---- MathML serializer -------------------------------------------------
  function mmlRow(kids) {
    if (!kids || !kids.length) return "<mrow></mrow>";
    if (kids.length === 1) return mml(kids[0]);
    return "<mrow>" + kids.map(mml).join("") + "</mrow>";
  }

  function mml(node) {
    if (!node) return "";
    switch (node.t) {
      case "row": return mmlRow(node.kids);
      case "num": return `<mn>${xml(node.v)}</mn>`;
      case "mi": return `<mi>${xml(node.v)}</mi>`;
      case "mo": return `<mo>${xml(node.v)}</mo>`;
      case "mtext": return `<mtext>${xml(node.v)}</mtext>`;
      case "space": return node.cmd === "break" ? "" : `<mspace width="${node.w}"/>`;
      case "opname": return `<mi mathvariant="normal">${xml(node.v)}</mi>`;
      case "bigop": return `<mo>${xml(node.ml)}</mo>`;
      case "sup": return `<msup>${mmlAtom(node.base)}${mmlAtom(node.exp)}</msup>`;
      case "sub": return `<msub>${mmlAtom(node.base)}${mmlAtom(node.sub)}</msub>`;
      case "subsup": return `<msubsup>${mmlAtom(node.base)}${mmlAtom(node.sub)}${mmlAtom(node.sup)}</msubsup>`;
      case "underover": {
        const base = mml(node.base);
        if (node.under && node.over) return `<munderover>${base}${mmlAtom(node.under)}${mmlAtom(node.over)}</munderover>`;
        if (node.over) return `<mover>${base}${mmlAtom(node.over)}</mover>`;
        return `<munder>${base}${mmlAtom(node.under)}</munder>`;
      }
      case "frac": return `<mfrac>${mmlAtom(node.num)}${mmlAtom(node.den)}</mfrac>`;
      case "binom":
        return `<mrow><mo>(</mo><mfrac linethickness="0">${mmlAtom(node.a)}${mmlAtom(node.b)}</mfrac><mo>)</mo></mrow>`;
      case "sqrt":
        return node.index
          ? `<mroot>${mmlAtom(node.rad)}${mmlAtom(node.index)}</mroot>`
          : `<msqrt>${mml(node.rad)}</msqrt>`;
      case "fenced": {
        const o = node.open ? `<mo>${xml(node.open)}</mo>` : "";
        const c = node.close ? `<mo>${xml(node.close)}</mo>` : "";
        return `<mrow>${o}${mml(node.body)}${c}</mrow>`;
      }
      case "accent":
        return `<mover accent="true">${mmlAtom(node.base)}<mo stretchy="false">${xml(node.chr)}</mo></mover>`;
      case "overline":
        return `<mover accent="true">${mmlAtom(node.base)}<mo>\u00af</mo></mover>`;
      case "underline":
        return `<munder accentunder="true">${mmlAtom(node.base)}<mo>\u005f</mo></munder>`;
      case "styled": {
        const v = mmlVariant(node.variant);
        return v ? `<mstyle mathvariant="${v}">${mml(node.kid)}</mstyle>` : mml(node.kid);
      }
      case "matrix": {
        const open = ENV_OPEN[node.env] || "";
        const close = ENV_CLOSE[node.env] || "";
        const colAlign = node.env === "cases" ? ' columnalign="left"' : "";
        const table =
          `<mtable${colAlign}>` +
          node.rows.map((r) => "<mtr>" + r.map((c) => `<mtd>${mml(c)}</mtd>`).join("") + "</mtr>").join("") +
          "</mtable>";
        const o = open ? `<mo>${xml(open)}</mo>` : "";
        const c = close ? `<mo>${xml(close)}</mo>` : "";
        return `<mrow>${o}${table}${c}</mrow>`;
      }
      default: return "";
    }
  }
  // Wrap a node in an explicit <mrow> when MathML needs a single argument box.
  function mmlAtom(node) {
    if (!node) return "<mrow></mrow>";
    if (node.t === "row") return node.kids.length === 1 ? mml(node.kids[0]) : `<mrow>${node.kids.map(mml).join("")}</mrow>`;
    return mml(node);
  }
  function mmlVariant(name) {
    return {
      mathrm: "normal", mathbf: "bold", mathbb: "double-struck", mathcal: "script",
      mathfrak: "fraktur", mathsf: "sans-serif", mathit: "italic", mathtt: "monospace",
      boldsymbol: "bold-italic",
    }[name] || "";
  }

  // ---- OMML serializer (Word) -------------------------------------------
  function ommlSeq(kids) {
    return (kids || []).map(omml).join("");
  }
  function ommlBox(node) {
    // Returns the OMML for an argument slot (already a sequence of elements).
    if (!node) return "";
    if (node.t === "row") return ommlSeq(node.kids);
    return omml(node);
  }
  function ommlText(s, upright) {
    const rPr = upright ? "<m:rPr><m:sty m:val=\"p\"/></m:rPr>" : "";
    return `<m:r>${rPr}<m:t xml:space="preserve">${xml(s)}</m:t></m:r>`;
  }
  function omml(node) {
    if (!node) return "";
    switch (node.t) {
      case "row": return ommlSeq(node.kids);
      case "num": return ommlText(node.v);
      case "mi": return ommlText(node.v);
      case "mo": return ommlText(node.v);
      case "mtext": return ommlText(node.v, !node.italic);
      case "space": return node.cmd === "break" ? "" : ommlText(" ");
      case "opname": return ommlText(node.v, true);
      case "bigop": return naryOmml(node, null, null);
      case "sup": return `<m:sSup><m:e>${ommlBox(node.base)}</m:e><m:sup>${ommlBox(node.exp)}</m:sup></m:sSup>`;
      case "sub": return `<m:sSub><m:e>${ommlBox(node.base)}</m:e><m:sub>${ommlBox(node.sub)}</m:sub></m:sSub>`;
      case "subsup":
        return `<m:sSubSup><m:e>${ommlBox(node.base)}</m:e><m:sub>${ommlBox(node.sub)}</m:sub><m:sup>${ommlBox(node.sup)}</m:sup></m:sSubSup>`;
      case "underover": {
        if (node.base.t === "bigop") return naryOmml(node.base, node.under, node.over);
        // function name with limits → limLow / limUpp
        let inner = ommlText(node.base.v, true);
        if (node.under) inner = `<m:limLow><m:e>${inner}</m:e><m:lim>${ommlBox(node.under)}</m:lim></m:limLow>`;
        if (node.over) inner = `<m:limUpp><m:e>${inner}</m:e><m:lim>${ommlBox(node.over)}</m:lim></m:limUpp>`;
        return inner;
      }
      case "frac":
        return `<m:f><m:num>${ommlBox(node.num)}</m:num><m:den>${ommlBox(node.den)}</m:den></m:f>`;
      case "binom":
        return `<m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr><m:e><m:f><m:fPr><m:type m:val="noBar"/></m:fPr><m:num>${ommlBox(node.a)}</m:num><m:den>${ommlBox(node.b)}</m:den></m:f></m:e></m:d>`;
      case "sqrt":
        return node.index
          ? `<m:rad><m:deg>${ommlBox(node.index)}</m:deg><m:e>${ommlBox(node.rad)}</m:e></m:rad>`
          : `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${ommlBox(node.rad)}</m:e></m:rad>`;
      case "fenced":
        return `<m:d><m:dPr><m:begChr m:val="${xml(node.open || "")}"/><m:endChr m:val="${xml(node.close || "")}"/></m:dPr><m:e>${ommlBox(node.body)}</m:e></m:d>`;
      case "accent":
        return `<m:acc><m:accPr><m:chr m:val="${xml(node.chr)}"/></m:accPr><m:e>${ommlBox(node.base)}</m:e></m:acc>`;
      case "overline":
        return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${ommlBox(node.base)}</m:e></m:bar>`;
      case "underline":
        return `<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr><m:e>${ommlBox(node.base)}</m:e></m:bar>`;
      case "styled":
        return ommlBox(node.kid);
      case "matrix": {
        const rowsXml = node.rows
          .map((r) => "<m:mr>" + r.map((c) => `<m:e>${ommlBox(c)}</m:e>`).join("") + "</m:mr>")
          .join("");
        const matrix = `<m:m><m:mPr><m:baseJc m:val="center"/><m:plcHide m:val="1"/></m:mPr>${rowsXml}</m:m>`;
        const open = ENV_OPEN[node.env] || "";
        const close = ENV_CLOSE[node.env] || "";
        if (open || close) {
          return `<m:d><m:dPr><m:begChr m:val="${xml(open)}"/><m:endChr m:val="${xml(close)}"/></m:dPr><m:e>${matrix}</m:e></m:d>`;
        }
        return matrix;
      }
      default: return "";
    }
  }
  // Large operators (∑ ∫ ∏ …) are rendered as a scripted operator glyph rather
  // than an OMML <m:nary>. Word's n-ary object always carries an operand slot
  // (<m:e>); because this converter lets the operand flow as the following
  // siblings (LaTeX doesn't syntactically bind it), that slot was empty and
  // Word drew it as an empty placeholder box (□) right after the operator.
  // Emitting the glyph with limLow/limUpp (stacked: ∑ ∏) or sSub/sSup/sSubSup
  // (side: ∫) has no operand slot, so the box is gone and the summand/integrand
  // still flows naturally after it.
  function naryOmml(op, under, over) {
    const glyph = ommlText(op.ml, true);
    if (op.under) {
      let inner = glyph;
      if (under) inner = `<m:limLow><m:e>${inner}</m:e><m:lim>${ommlBox(under)}</m:lim></m:limLow>`;
      if (over) inner = `<m:limUpp><m:e>${inner}</m:e><m:lim>${ommlBox(over)}</m:lim></m:limUpp>`;
      return inner;
    }
    if (under && over) {
      return `<m:sSubSup><m:e>${glyph}</m:e><m:sub>${ommlBox(under)}</m:sub><m:sup>${ommlBox(over)}</m:sup></m:sSubSup>`;
    }
    if (under) return `<m:sSub><m:e>${glyph}</m:e><m:sub>${ommlBox(under)}</m:sub></m:sSub>`;
    if (over) return `<m:sSup><m:e>${glyph}</m:e><m:sup>${ommlBox(over)}</m:sup></m:sSup>`;
    return glyph;
  }

  // ---- Unicode (plain-text) serializer ----------------------------------
  // Renders the AST to readable Unicode for formats with no math layer
  // (e.g. RTF). Superscripts/subscripts use Unicode modifier characters when
  // every character maps; otherwise they degrade to ^(…) / _(…) notation.
  const SUPER = {
    "0": "\u2070", "1": "\u00b9", "2": "\u00b2", "3": "\u00b3", "4": "\u2074",
    "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079",
    "+": "\u207a", "-": "\u207b", "\u2212": "\u207b", "=": "\u207c", "(": "\u207d", ")": "\u207e",
    a: "\u1d43", b: "\u1d47", c: "\u1d9c", d: "\u1d48", e: "\u1d49", f: "\u1da0",
    g: "\u1d4d", h: "\u02b0", i: "\u2071", j: "\u02b2", k: "\u1d4f", l: "\u02e1",
    m: "\u1d50", n: "\u207f", o: "\u1d52", p: "\u1d56", r: "\u02b3", s: "\u02e2",
    t: "\u1d57", u: "\u1d58", v: "\u1d5b", w: "\u02b7", x: "\u02e3", y: "\u02b8", z: "\u1dbb",
  };
  const SUB = {
    "0": "\u2080", "1": "\u2081", "2": "\u2082", "3": "\u2083", "4": "\u2084",
    "5": "\u2085", "6": "\u2086", "7": "\u2087", "8": "\u2088", "9": "\u2089",
    "+": "\u208a", "-": "\u208b", "\u2212": "\u208b", "=": "\u208c", "(": "\u208d", ")": "\u208e",
    a: "\u2090", e: "\u2091", h: "\u2095", i: "\u1d62", j: "\u2c7c", k: "\u2096",
    l: "\u2097", m: "\u2098", n: "\u2099", o: "\u2092", p: "\u209a", r: "\u1d63",
    s: "\u209b", t: "\u209c", u: "\u1d64", v: "\u1d65", x: "\u2093",
  };
  const COMBINING = {
    "\u005e": "\u0302", "\u007e": "\u0303", "\u00af": "\u0304", "\u2192": "\u20d7",
    "\u02d9": "\u0307", "\u00a8": "\u0308", "\u02c7": "\u030c", "\u00b4": "\u0301", "\u0060": "\u0300",
  };

  function toScript(str, map) {
    if (!str) return null;
    let out = "";
    for (const ch of str) {
      if (map[ch] === undefined) return null;
      out += map[ch];
    }
    return out;
  }

  function uniInner(node) {
    if (node && node.t === "row") return node.kids.map(uni).join("");
    return uni(node);
  }
  function uniParen(s) {
    return /^[A-Za-z0-9.]+$/.test(s) ? s : "(" + s + ")";
  }
  function uniScript(node, map, sign) {
    const inner = uniInner(node);
    // ^{\circ} (ring operator in a superscript) is virtually always a degree sign.
    if (sign === "^" && inner === "\u2218") return "\u00b0";
    const conv = toScript(inner, map);
    if (conv !== null) return conv;
    return sign + uniParen(inner);
  }

  function uni(node) {
    if (!node) return "";
    switch (node.t) {
      case "row": return (node.kids || []).map(uni).join("");
      case "num": return node.v;
      case "mi": return node.v;
      case "mo": return node.v;
      case "mtext": return node.v;
      case "space": return node.cmd === "break" ? " " : " ";
      case "opname": return node.v;
      case "bigop": return node.ml;
      case "sup": return uniInner(node.base) + uniScript(node.exp, SUPER, "^");
      case "sub": return uniInner(node.base) + uniScript(node.sub, SUB, "_");
      case "subsup":
        return uniInner(node.base) + uniScript(node.sub, SUB, "_") + uniScript(node.sup, SUPER, "^");
      case "underover": {
        let s = node.base.t === "bigop" ? node.base.ml : uniInner(node.base);
        if (node.under) s += "_" + uniParen(uniInner(node.under));
        if (node.over) s += "^" + uniParen(uniInner(node.over));
        return s;
      }
      case "frac": return uniParen(uniInner(node.num)) + "/" + uniParen(uniInner(node.den));
      case "binom": return "C(" + uniInner(node.a) + ", " + uniInner(node.b) + ")";
      case "sqrt": {
        const body = "\u221a(" + uniInner(node.rad) + ")";
        if (node.index) {
          const idx = toScript(uniInner(node.index), SUPER);
          return (idx !== null ? idx : "[" + uniInner(node.index) + "]") + body;
        }
        return body;
      }
      case "fenced": return (node.open || "") + uniInner(node.body) + (node.close || "");
      case "accent": {
        const base = uniInner(node.base);
        const comb = COMBINING[node.chr];
        return comb && base ? base + comb : base;
      }
      case "overline": return uniInner(node.base);
      case "underline": return uniInner(node.base);
      case "styled": return uniInner(node.kid);
      case "matrix": {
        const open = ENV_OPEN[node.env] || "";
        const close = ENV_CLOSE[node.env] || "";
        const body = node.rows.map((r) => r.map(uniInner).join(", ")).join("; ");
        return open + body + close;
      }
      default: return "";
    }
  }

  // Matrix/cases environments have no AST node; for plain-text rendering we
  // flatten them to bracketed, semicolon-separated rows before parsing.
  const ENV_OPEN = {
    pmatrix: "(", bmatrix: "[", Bmatrix: "{", vmatrix: "|", Vmatrix: "\u2016",
    matrix: "", smallmatrix: "", cases: "{", aligned: "", align: "", array: "",
  };
  const ENV_CLOSE = {
    pmatrix: ")", bmatrix: "]", Bmatrix: "}", vmatrix: "|", Vmatrix: "\u2016",
    matrix: "", smallmatrix: "", cases: "", aligned: "", align: "", array: "",
  };
  function flattenEnvironments(tex) {
    let s = String(tex || "")
      .replace(/\\begin\{([a-zA-Z*]+)\}(\{[^}]*\})?/g, (_, e) => (ENV_OPEN[e] !== undefined ? ENV_OPEN[e] : ""))
      .replace(/\\end\{([a-zA-Z*]+)\}/g, (_, e) => (ENV_CLOSE[e] !== undefined ? ENV_CLOSE[e] : ""));
    // Row/column separators only matter inside the now-flattened environments.
    if (/[\[({|\u2016]/.test(s)) s = s.replace(/\\\\/g, "; ").replace(/&/g, ", ");
    return s;
  }

  // ---- public API --------------------------------------------------------
  function toUnicode(tex) {
    try {
      return uni(parse(flattenEnvironments(tex))).replace(/[ \t]{2,}/g, " ").trim();
    } catch { return String(tex || ""); }
  }
  function toMathML(tex, display) {
    let body;
    try { body = mml(parse(tex || "")); }
    catch { body = `<mtext>${xml(tex || "")}</mtext>`; }
    const disp = display ? ' display="block"' : "";
    return `<math xmlns="http://www.w3.org/1998/Math/MathML"${disp}>${body}</math>`;
  }
  function toOMML(tex) {
    let body;
    try { body = omml(parse(tex || "")); }
    catch { body = ommlText(tex || ""); }
    return `<m:oMath>${body}</m:oMath>`;
  }
  GEP.texmath = { toMathML, toOMML, toUnicode, parse };
})();
