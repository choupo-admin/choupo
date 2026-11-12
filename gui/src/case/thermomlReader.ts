/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  thermomlReader -- a ThermoML file read in the browser, giving EXACTLY the
  points `bin/choupo-thermoml extract-vle` and `extract-px` give (DEV.md 4c
  C332/C334; the same reader serves C289's Explorer overlay).

  ONE READER, TWO LANGUAGES, HELD TO EACH OTHER.  The Python extractor is the
  reader of record: every curated pair in the catalogue was fitted to what it
  wrote.  This module is its transcription, function by function --
  `_one_bubble_block` is `readBubbleT`, `_one_bubbleP_block` is
  `readBubbleP`, `extract_binary_bubble[P]` is `selectBlock` -- with the same
  refusals, in the same words, and the same order of points.
  gui/tests/thermomlReader.test.ts runs BOTH readers on synthetic files and
  requires the same records, the same refusal sentences and the same written
  data rows; docs/design/from-a-database-to-binary-parameters.md says what was
  run on real archive files and how.  A change to either reader that the
  other does not follow fails that test.

  NO PAGE DEPENDENCY.  This file imports nothing: no React, no dict parser,
  no DOM (ThermoML is parsed by the small XML reader below, so the module
  runs the same in a browser, a worker and the node test runner).

  WHAT IT DOES NOT DO, said so a caller does not assume it:
    * the identity join.  The extractor joins each compound to a catalogue
      component by InChIKey through `identity.json`, a bridge built from two
      resolvers that must agree; that file is not in the tree and not in the
      browser.  This reader returns the archive's own names and identifiers
      and leaves the join to its caller.
    * the companion vapour block (`_vapour_series`): the y column is not read.
    * the v5 dialect: refused, as the extractor refuses it.
\*---------------------------------------------------------------------------*/

// =============================================================================
//  1. A SMALL XML READER with ElementTree's semantics where they matter here.
// =============================================================================

/** One element.  `tag` is the LOCAL name (namespace prefix removed, as the
 *  extractor's `local()` does); `text` is ElementTree's `.text` -- the
 *  character data before the first child element, entities decoded,
 *  comments and processing instructions skipped (ET's default tree builder
 *  drops them and joins the text around them). */
export interface XmlNode {
  tag: string;
  text: string;
  children: XmlNode[];
}

export class XmlParseError extends Error {}

const ENTITIES: Record<string, string> = {
  lt: "<", gt: ">", amp: "&", quot: "\"", apos: "'",
};

function decodeEntities(s: string, at: number): string {
  if (s.indexOf("&") < 0) return s;
  return s.replace(/&([^;\s&]*);?/g, (m, name: string) => {
    if (!m.endsWith(";")) throw new XmlParseError(`unterminated entity near offset ${at}`);
    if (name.startsWith("#x") || name.startsWith("#X")) {
      const cp = parseInt(name.slice(2), 16);
      if (!Number.isFinite(cp)) throw new XmlParseError(`bad character reference &${name};`);
      return String.fromCodePoint(cp);
    }
    if (name.startsWith("#")) {
      const cp = parseInt(name.slice(1), 10);
      if (!Number.isFinite(cp)) throw new XmlParseError(`bad character reference &${name};`);
      return String.fromCodePoint(cp);
    }
    const v = ENTITIES[name];
    if (v === undefined) throw new XmlParseError(`undefined entity &${name};`);
    return v;
  });
}

const localName = (qname: string): string => {
  const i = qname.indexOf(":");
  return i < 0 ? qname : qname.slice(i + 1);
};

/** Parse a whole document; returns its root element.  Refuses (throws
 *  XmlParseError) on anything malformed rather than guessing. */
export function parseXml(src: string): XmlNode {
  let i = 0;
  const n = src.length;
  if (src.charCodeAt(0) === 0xfeff) i = 1;
  const stack: { node: XmlNode; name: string; sawChild: boolean }[] = [];
  let root: XmlNode | null = null;

  const addText = (t: string) => {
    const top = stack[stack.length - 1];
    if (!top) {
      if (t.trim()) throw new XmlParseError(`text outside the root element at offset ${i}`);
      return;
    }
    if (!top.sawChild) top.node.text += t;
  };

  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt < 0) { addText(decodeEntities(src.slice(i), i)); break; }
    if (lt > i) addText(decodeEntities(src.slice(i, lt), i));
    i = lt;
    if (src.startsWith("<!--", i)) {
      const e = src.indexOf("-->", i + 4);
      if (e < 0) throw new XmlParseError("unterminated comment");
      //  XML forbids "--" inside a comment, and the extractor's parser
      //  refuses such a file; so does this one.
      if (src.slice(i + 4, e).includes("--") || src[e - 1] === "-")
        throw new XmlParseError(`"--" inside a comment at offset ${i}`);
      i = e + 3; continue;
    }
    if (src.startsWith("<?", i)) {
      const e = src.indexOf("?>", i + 2);
      if (e < 0) throw new XmlParseError("unterminated processing instruction");
      i = e + 2; continue;
    }
    if (src.startsWith("<![CDATA[", i)) {
      const e = src.indexOf("]]>", i + 9);
      if (e < 0) throw new XmlParseError("unterminated CDATA section");
      addText(src.slice(i + 9, e));
      i = e + 3; continue;
    }
    if (src.startsWith("<!DOCTYPE", i)) {
      //  A document type declaration may carry an internal subset; entities
      //  declared there are not supported, and a file that USES one fails on
      //  that entity, by name.
      let depth = 0, j = i + 9;
      for (; j < n; j++) {
        const c = src[j];
        if (c === "[") depth++;
        else if (c === "]") depth--;
        else if (c === ">" && depth === 0) break;
      }
      if (j >= n) throw new XmlParseError("unterminated DOCTYPE");
      i = j + 1; continue;
    }
    if (src.startsWith("</", i)) {
      const e = src.indexOf(">", i);
      if (e < 0) throw new XmlParseError("unterminated end tag");
      const name = src.slice(i + 2, e).trim();
      const top = stack.pop();
      if (!top || top.name !== name)
        throw new XmlParseError(`mismatched end tag </${name}> at offset ${i}`);
      i = e + 1;
      if (stack.length === 0) root = top.node;
      continue;
    }
    //  A start tag; attributes are skipped (ThermoML puts no data in them),
    //  but quoted values are honoured so a '>' inside one does not end the tag.
    let j = i + 1, quote = "";
    for (; j < n; j++) {
      const c = src[j]!;
      if (quote) { if (c === quote) quote = ""; continue; }
      if (c === "\"" || c === "'") quote = c;
      else if (c === ">") break;
    }
    if (j >= n) throw new XmlParseError("unterminated start tag");
    const raw = src.slice(i + 1, j);
    const selfClosing = raw.endsWith("/");
    const name = (selfClosing ? raw.slice(0, -1) : raw).trim().split(/\s+/)[0] ?? "";
    if (!name) throw new XmlParseError(`empty tag name at offset ${i}`);
    const node: XmlNode = { tag: localName(name), text: "", children: [] };
    const parent = stack[stack.length - 1];
    if (parent) { parent.node.children.push(node); parent.sawChild = true; }
    else if (root) throw new XmlParseError("a second root element");
    if (selfClosing) {
      if (!parent) root = node;
    } else {
      stack.push({ node, name, sawChild: false });
    }
    i = j + 1;
  }
  if (stack.length) throw new XmlParseError(`unclosed element <${stack[stack.length - 1]!.name}>`);
  if (!root) throw new XmlParseError("no root element");
  return root;
}

/** The element and all its descendants, document order (ET's `iter()`). */
export function iter(e: XmlNode): XmlNode[] {
  const out: XmlNode[] = [];
  const walk = (x: XmlNode) => { out.push(x); for (const c of x.children) walk(c); };
  walk(e);
  return out;
}

/** `find_all` of the extractor: every element of that local name, self included. */
export function findAll(e: XmlNode, name: string): XmlNode[] {
  return iter(e).filter((x) => x.tag === name);
}

/** Python's str.strip() for the whitespace an XML file carries. */
const pyStrip = (s: string): string => s.replace(/^\s+|\s+$/g, "");

/** `find_text`: the stripped text of the first element of that name whose
 *  text is non-empty BEFORE stripping (the extractor tests `e.text`). */
export function findText(e: XmlNode, name: string, dflt = ""): string {
  for (const x of iter(e)) if (x.tag === name && x.text) return pyStrip(x.text);
  return dflt;
}

// =============================================================================
//  2. PYTHON'S NUMBERS: float(), repr(), round(x, 6), f"{x:8.4f}", f"{x:.6g}"
// =============================================================================

export class PyValueError extends Error {}

const DIGITS = "\\d(?:_?\\d)*";
const PY_FLOAT_RE = new RegExp(
  `^[+-]?(?:(?:${DIGITS})(?:\\.(?:${DIGITS})?)?|\\.(?:${DIGITS}))(?:[eE][+-]?${DIGITS})?$`);

/** `float(s)`: the same strings accepted, the same double returned (a
 *  decimal string converts with correct rounding in both languages). */
export function pyFloat(s: string): number {
  const t = pyStrip(s);
  const low = t.toLowerCase();
  if (/^[+-]?(inf|infinity)$/.test(low)) return low.startsWith("-") ? -Infinity : Infinity;
  if (/^[+-]?nan$/.test(low)) return NaN;
  if (!PY_FLOAT_RE.test(t)) throw new PyValueError(`could not convert string to float: '${s}'`);
  return Number(t.replace(/_/g, ""));
}

/** The exact decimal value of a finite double: digits and the power of ten
 *  of the LAST digit (value = digits * 10^exp10). */
function exactDecimal(x: number): { neg: boolean; digits: string; exp10: number } {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const hi = buf.getUint32(0), lo = buf.getUint32(4);
  const neg = (hi >>> 31) === 1;
  const e = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let pow2: number;
  if (e === 0) pow2 = -1074;
  else { mant |= 1n << 52n; pow2 = e - 1075; }
  if (mant === 0n) return { neg, digits: "0", exp10: 0 };
  if (pow2 >= 0) return { neg, digits: (mant << BigInt(pow2)).toString(), exp10: 0 };
  //  mant / 2^k = mant * 5^k / 10^k
  const k = -pow2;
  return { neg, digits: (mant * 5n ** BigInt(k)).toString(), exp10: -k };
}

/** Round an exact decimal, half to EVEN (Python's rule for format and
 *  round()), keeping `keep` digits; returns the rounded integer string. */
function roundDigitsHalfEven(digits: string, keep: number): string {
  if (keep >= digits.length) return digits + "0".repeat(keep - digits.length);
  if (keep < 0) return "0";
  const head = keep === 0 ? 0n : BigInt(digits.slice(0, keep));
  const rest = digits.slice(keep);
  const first = rest.charCodeAt(0) - 48;
  const tailNonZero = /[1-9]/.test(rest.slice(1));
  let up = false;
  if (first > 5 || (first === 5 && tailNonZero)) up = true;
  else if (first === 5 && !tailNonZero) up = (head % 2n) === 1n;
  return (up ? head + 1n : head).toString();
}

/** f"{x:.{d}f}" (no width). */
export function pyFixed(x: number, d: number): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "nan" : (x > 0 ? "inf" : "-inf");
  const { neg, digits, exp10 } = exactDecimal(x);
  //  value = digits * 10^exp10; we want an integer of value * 10^d
  const shift = exp10 + d;            // digits * 10^shift
  let r: string;
  if (shift >= 0) r = digits + "0".repeat(shift);
  else r = roundDigitsHalfEven(digits, digits.length + shift);
  r = r.replace(/^0+(?=\d)/, "");
  const padded = r.padStart(d + 1, "0");
  const intPart = padded.slice(0, padded.length - d);
  const frac = padded.slice(padded.length - d);
  const body = d > 0 ? `${intPart}.${frac}` : intPart;
  return (neg ? "-" : "") + body;   // Python keeps the sign of a negative zero
}

/** f"{x:{w}.{d}f}": right-aligned in a field of width w. */
export function pyFixedW(x: number, w: number, d: number): string {
  return pyFixed(x, d).padStart(w, " ");
}

/** f"{x:.{p}g}" -- Python's general format (p significant digits, trailing
 *  zeros removed, exponent form outside -4 <= X < p). */
export function pyG(x: number, p = 6): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "nan" : (x > 0 ? "inf" : "-inf");
  if (p === 0) p = 1;
  const { neg, digits, exp10 } = exactDecimal(x);
  const sign = neg ? "-" : "";
  if (/^0+$/.test(digits)) return sign + "0";
  //  decimal exponent of the leading digit
  let X = digits.length - 1 + exp10;
  let r = roundDigitsHalfEven(digits, p);
  if (r.length > p) { r = r.slice(0, p); X += 1; }   // 9.99.. -> 10.0
  if (X >= -4 && X < p) {
    const s = pyFixedFromSig(r, X, p - 1 - X);
    return sign + stripZeros(s);
  }
  const mant = stripZeros(r.length > 1 ? `${r[0]}.${r.slice(1)}` : r);
  const ex = Math.abs(X) < 10 ? `0${Math.abs(X)}` : `${Math.abs(X)}`;
  return `${sign}${mant}e${X < 0 ? "-" : "+"}${ex}`;
}

function pyFixedFromSig(sig: string, X: number, d: number): string {
  //  sig: p significant digits with the first at 10^X; write with d decimals.
  const intDigits = X + 1;
  let s: string;
  if (intDigits <= 0) s = "0." + "0".repeat(-intDigits) + sig;
  else if (intDigits >= sig.length) s = sig + "0".repeat(intDigits - sig.length);
  else s = sig.slice(0, intDigits) + "." + sig.slice(intDigits);
  if (d <= 0) return s.split(".")[0]!;
  return s;
}

function stripZeros(s: string): string {
  if (s.indexOf(".") < 0) return s;
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

/** round(x, 6) -- half to even on the exact value. */
export function pyRound6(x: number): number {
  if (!Number.isFinite(x)) return x;
  return Number(pyFixed(x, 6));
}

/** repr(x) of a Python float: the shortest round-trip digits, fixed for a
 *  decimal exponent in [-4, 16), exponent form otherwise, a '.0' on an
 *  integral value. */
export function pyRepr(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const e = x.toExponential();             // shortest round-trip, d.ddde±X
  const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(e)!;
  const sign = m[1]!, digs = m[2]! + (m[3] ?? ""), X = Number(m[4]);
  if (X >= -4 && X < 16) {
    let s: string;
    if (X < 0) s = "0." + "0".repeat(-X - 1) + digs;
    else if (digs.length <= X + 1) s = digs + "0".repeat(X + 1 - digs.length) + ".0";
    else s = digs.slice(0, X + 1) + "." + digs.slice(X + 1);
    return sign + s;
  }
  const mant = digs.length > 1 ? `${digs[0]}.${digs.slice(1)}` : digs;
  const ex = Math.abs(X) < 10 ? `0${Math.abs(X)}` : `${Math.abs(X)}`;
  return `${sign}${mant}e${X < 0 ? "-" : "+"}${ex}`;
}

/** repr() of a list of str, as the refusal messages print one. */
const pyListRepr = (xs: readonly string[]): string =>
  "[" + xs.map((s) => `'${s}'`).join(", ") + "]";

// =============================================================================
//  3. THE THERMOML FILE
// =============================================================================

/** One <Compound> of the file, as the extractor's compounds_published reads it. */
export interface ThermoMLCompound {
  orgNum: string;
  name: string;
  formula: string;
  inchi: string;
  inchikey: string;
  cas: string;
}

/** A refusal: a block that is not the geometry asked for, in the extractor's words. */
export interface Refusal { refused: string }

/** extract-vle's record of one block: isobaric (or multi-isobar) bubble
 *  TEMPERATURE.  `points` are (x1, T / K) sorted; `uT` the per-point expanded
 *  uncertainty in K (null where the file states none -- never zero). */
export interface BubbleTRecord {
  kind: "bubbleT";
  system: [string, string];
  members: [string, string];
  doi: string;
  points: [number, number][];
  uT: (number | null)[];
  uTLevel: string;
  /** Held constant: one pressure, kPa, as round(P, 6). */
  PkPa?: number;
  /** Varied: one pressure per point, kPa, in `points` order. */
  PkPaPerPoint?: number[];
  isobars?: number[];
}

/** extract-px's record of one block: bubble PRESSURE at a stated temperature.
 *  `points` are (x1, T / K, P / kPa), sorted by (T, x1). */
export interface BubblePRecord {
  kind: "bubbleP";
  system: [string, string];
  members: [string, string];
  doi: string;
  points: [number, number, number][];
  uP: number[];
  uPLevel: string;
  TK?: number;
  isotherms?: number[];
}

/** A Python exception that is NOT a refusal (a value float() cannot read). */
export interface ReaderError { error: string }

export type BlockOutcome<R> = R | Refusal | ReaderError;

export interface ThermoMLBlock {
  /** The index the extractor's `--block N` uses. */
  index: number;
  /** <Component> count, and the property names, for the page's table. */
  nComponents: number;
  properties: string[];
  bubbleT: BlockOutcome<BubbleTRecord>;
  bubbleP: BlockOutcome<BubblePRecord>;
}

export interface ThermoMLFile {
  doi: string;
  title: string;
  journal: string;
  year: string;
  authors: string[];
  compounds: ThermoMLCompound[];
  blocks: ThermoMLBlock[];
}

export const isRefusal = (x: unknown): x is Refusal =>
  typeof x === "object" && x !== null && "refused" in x;
export const isReaderError = (x: unknown): x is ReaderError =>
  typeof x === "object" && x !== null && "error" in x;

class BubbleRefusal extends Error {}

/** compounds_published. */
export function compoundsOf(root: XmlNode): ThermoMLCompound[] {
  return findAll(root, "Compound").map((c) => {
    let cas = "";
    for (const rn of findAll(c, "RegNum")) {
      const v = findText(rn, "nCASRegNum");
      if (v) cas = v;
    }
    return {
      orgNum: findText(c, "nOrgNum"),
      name: findText(c, "sCommonName"),
      formula: findText(c, "sFormulaMolec"),
      inchi: findText(c, "sStandardInChI"),
      inchikey: findText(c, "sStandardInChIKey"),
      cas,
    };
  });
}

type VarKind = [kind: string, unit: string, org: string];

/** _var_kind: read from the DECLARED type element, never from position. */
function varKind(v: XmlNode): VarKind {
  let unit = "", kind = "other";
  for (const e of iter(v)) {
    const t = e.tag, txt = pyStrip(e.text ?? "");
    if (!txt) continue;
    if (t.startsWith("e") && txt.includes(",")) unit = txt;
    const low = txt.toLowerCase();
    if (low.includes("pressure")) kind = "pressure";
    else if (low.includes("mole fraction") || low.includes("composition")) kind = "composition";
    else if (low.includes("temperature")) kind = "temperature";
  }
  return [kind, unit, findText(v, "nOrgNum")];
}

/** The block's member names by RegNum, in `members` order (the extractor's
 *  by_org join: the FILE's compounds, never document position). */
function namesOf(root: XmlNode, members: string[]): string[] {
  const comps = compoundsOf(root);
  const orgs = findAll(root, "Compound").map((x) => findText(x, "nOrgNum"));
  const byOrg = new Map<string, string>();
  comps.forEach((c, k) => { const org = orgs[k]; if (org) byOrg.set(org, c.name); });
  return members.map((m) => byOrg.get(m) ?? "");
}

function propsOf(pom: XmlNode): Map<string, string> {
  const props = new Map<string, string>();
  for (const pr of findAll(pom, "Property")) {
    const num = findText(pr, "nPropNumber"), name = findText(pr, "ePropName");
    if (num && name) props.set(num, name);
  }
  return props;
}

/** A float as a key with Python's equality (0.0 == -0.0). */
const fkey = (v: number): string => pyRepr(v === 0 ? 0 : v);

const cmpTuple = (a: readonly number[], b: readonly number[]): number => {
  for (let k = 0; k < Math.min(a.length, b.length); k++) {
    if (a[k]! < b[k]!) return -1;
    if (a[k]! > b[k]!) return 1;
  }
  return a.length - b.length;
};

/** _one_bubble_block: one block as a bubble-TEMPERATURE series, or a refusal. */
export function readBubbleT(root: XmlNode, pom: XmlNode, doi: string): BubbleTRecord {
  let members = findAll(pom, "Component").map((c) => findText(c, "nOrgNum"));
  if (members.length !== 2)
    throw new BubbleRefusal(`this dataset declares ${members.length} component(s).  `
      + "Only BINARY systems are interpreted.");
  const props = propsOf(pom);
  if (props.size !== 1)
    throw new BubbleRefusal(`this dataset declares ${props.size} properties `
      + `(${[...props.values()].sort().join(", ") || "none"}).  A bubble `
      + "series carries exactly one: the temperature.");
  const [pnum, pname] = [...props.entries()][0]!;
  if (!pname.toLowerCase().includes("temperature"))
    throw new BubbleRefusal(`the measured property is '${pname}'.  This extractor reads `
      + "the BUBBLE TEMPERATURE; a dataset whose property is a "
      + "pressure or a composition is a different geometry.");

  const kinds = new Map<string, VarKind>();
  for (const v of findAll(pom, "Variable")) {
    const num = findText(v, "nVarNumber");
    if (num) kinds.set(num, varKind(v));
  }
  let kindset = [...kinds.values()].map((k) => k[0]).sort();

  let pconst: number | null = null;
  if (!kindset.includes("pressure")) {
    for (const c of findAll(pom, "Constraint")) {
      let unit = "";
      for (const e of iter(c)) if (e.tag === "ePressure" && e.text) unit = pyStrip(e.text);
      if (!unit) continue;
      if (!unit.toLowerCase().includes("kpa"))
        throw new BubbleRefusal(`the held-constant pressure is declared in '${unit}'.  `
          + "Only kPa is read today; a unit conversion here would be "
          + "a silent one.");
      const val = findText(c, "nConstraintValue");
      if (val) {
        pconst = pyFloat(val);
        kindset = [...kindset, "pressure"].sort();
        break;
      }
    }
  }
  if (!(kindset.length === 2 && kindset[0] === "composition" && kindset[1] === "pressure")) {
    const declared = [...kinds.values()].map((k) => k[0]).sort();
    throw new BubbleRefusal(`the declared variables are ${pyListRepr(declared.length ? declared : ["none"])}`
      + " and no held-constant pressure was found among the Constraints."
      + "  This extractor requires a liquid composition and a pressure "
      + "(either form) -- it does not choose among the variables "
      + "present, because choosing is guessing.");
  }
  const pvar = [...kinds.entries()].find(([, k]) => k[0] === "pressure")?.[0] ?? null;
  const xvar = [...kinds.entries()].find(([, k]) => k[0] === "composition")![0];
  const xorg = kinds.get(xvar)![2];
  if (xorg && xorg !== members[0]) members = [members[1]!, members[0]!];
  if (pvar !== null) {
    const punit = kinds.get(pvar)![1];
    if (!punit.toLowerCase().includes("kpa"))
      throw new BubbleRefusal(`the pressure is declared in '${punit}'.  Only kPa is read `
        + "today; a unit conversion here would be a silent one.");
  }

  const pressures = new Set<number>();
  const points: [number, number][] = [];
  const pPer: number[] = [];
  const uPer: (number | null)[] = [];
  for (const nv of findAll(pom, "NumValues")) {
    const xs = new Map<string, string>();
    for (const x of findAll(nv, "VariableValue"))
      xs.set(findText(x, "nVarNumber"), findText(x, "nVarValue"));
    if (!xs.has(xvar) || (pvar !== null && !xs.has(pvar)))
      throw new BubbleRefusal("a data point declares only one of the two required "
        + "variables -- the series is not a bubble curve.");
    let tval = "", uval = "";
    for (const pv of findAll(nv, "PropertyValue")) {
      if (findText(pv, "nPropNumber") === pnum) {
        tval = findText(pv, "nPropValue");
        uval = findText(pv, "nCombExpandUncertValue");
      }
    }
    if (!tval) continue;
    const pk = pvar !== null ? pyFloat(xs.get(pvar)!) : pyFloat(pyRepr(pconst!));
    pressures.add(pyRound6(pk));
    points.push([pyFloat(xs.get(xvar)!), pyFloat(tval)]);
    pPer.push(pk);
    uPer.push(uval ? pyFloat(uval) : null);
  }
  if (points.length < 2) throw new BubbleRefusal("fewer than two usable points");

  const seen = new Set<string>();
  const dup: [number, number, number][] = [];
  points.forEach(([x, t], k) => {
    const key = [x, t, pyRound6(pPer[k]!)];
    const ks = key.map(fkey).join(",");
    if (seen.has(ks)) dup.push(key as [number, number, number]);
    seen.add(ks);
  });
  if (dup.length)
    throw new BubbleRefusal(`${dup.length} of ${points.length} (x, P, T) rows repeat an earlier `
      + `row exactly (first: x = ${pyRepr(dup[0]![0])}, P = ${pyRepr(dup[0]![2])} kPa, `
      + `T = ${pyRepr(dup[0]![1])} K).  A duplicated observation would count twice `
      + "in a fit; read the article before choosing one copy.");

  const names = namesOf(root, members);
  if (!names.every(Boolean))
    throw new BubbleRefusal("a component of this dataset could not be resolved to a "
      + "compound name by its RegNum.  The axis of x1 would be a "
      + "guess, and a mislabelled axis is a wrong answer that nothing "
      + "downstream can detect.");
  let level = "";
  for (const pr of findAll(pom, "Property"))
    if (findText(pr, "nPropNumber") === pnum) level = findText(pr, "nCombUncertLevOfConfid");

  const order = points.map((_, k) => k).sort((a, b) => cmpTuple(points[a]!, points[b]!) || a - b);
  const rec: BubbleTRecord = {
    kind: "bubbleT",
    system: [names[0]!, names[1]!],
    members: [members[0]!, members[1]!],
    doi,
    points: order.map((k) => points[k]!),
    uT: order.map((k) => uPer[k]!),
    uTLevel: level,
  };
  if (pressures.size === 1) rec.PkPa = [...pressures][0]!;
  else {
    rec.PkPaPerPoint = order.map((k) => pPer[k]!);
    rec.isobars = [...pressures].sort((a, b) => a - b);
  }
  return rec;
}

/** _one_bubbleP_block: one block as an isothermal bubble-PRESSURE series. */
export function readBubbleP(root: XmlNode, pom: XmlNode, doi: string, multi = false): BubblePRecord {
  let members = findAll(pom, "Component").map((c) => findText(c, "nOrgNum"));
  if (members.length !== 2)
    throw new BubbleRefusal(`this dataset declares ${members.length} component(s).  `
      + "Only BINARY systems are interpreted.");
  const props = propsOf(pom);
  if (props.size !== 1)
    throw new BubbleRefusal(`this dataset declares ${props.size} properties `
      + `(${[...props.values()].sort().join(", ") || "none"}); a `
      + "bubble-pressure series carries exactly one: the pressure.");
  const [pnum, pname] = [...props.entries()][0]!;
  if (!pname.toLowerCase().startsWith("vapor or sublimation pressure"))
    throw new BubbleRefusal(`the measured property is '${pname}', not a pressure.`);
  if (!pname.toLowerCase().includes("kpa"))
    throw new BubbleRefusal(`the pressure is declared in '${pname}'; only kPa is read `
      + "(a conversion here would be a silent one).");
  const kinds = new Map<string, [string, string, string, string]>();
  for (const v of findAll(pom, "Variable")) {
    const num = findText(v, "nVarNumber");
    if (num) kinds.set(num, [...varKind(v), findText(v, "eVarPhase")]);
  }
  const compVars = [...kinds.entries()].filter(([, k]) => k[0] === "composition").map(([n]) => n);
  const liq = compVars.filter((n) => kinds.get(n)![3] === "Liquid");
  if (!liq.length) {
    if (compVars.length)
      throw new BubbleRefusal("REPORTS y BUT NO x: the only composition variable is "
        + "the vapour (Gas) mole fraction; a bubble-pressure "
        + "pair fit needs the liquid composition.");
    throw new BubbleRefusal("no liquid mole fraction among the variables.");
  }
  if (liq.length !== 1 || compVars.length !== 1)
    throw new BubbleRefusal("more than one composition variable; choosing among "
      + "them would be guessing.");
  const xvar = liq[0]!;
  const xorg = kinds.get(xvar)![2];
  if (xorg && xorg !== members[0]) members = [members[1]!, members[0]!];
  if ([...kinds.values()].some((k) => k[0] === "pressure"))
    throw new BubbleRefusal("a pressure is declared as a VARIABLE although the "
      + "pressure is the measured property.");
  const tvars = [...kinds.entries()].filter(([, k]) => k[0] === "temperature").map(([n]) => n);
  const others = [...kinds.entries()].filter(([, k]) => k[0] !== "composition" && k[0] !== "temperature");
  if (others.length)
    throw new BubbleRefusal("an unrecognised variable is declared; this reader "
      + "takes only the liquid composition and the temperature.");
  const lastUnit = (u: string): string => pyStrip(u.split(",").pop() ?? "").toLowerCase();
  let Tconst: number | null = null;
  for (const c of findAll(pom, "Constraint")) {
    let unit = "";
    for (const e of iter(c)) if (e.tag === "eTemperature" && e.text) unit = pyStrip(e.text);
    if (unit) {
      if (lastUnit(unit) !== "k")
        throw new BubbleRefusal(`the held temperature is declared in '${unit}'; `
          + "only K is read.");
      if (Tconst !== null || tvars.length)
        throw new BubbleRefusal("the temperature is declared more than once.");
      try { Tconst = pyFloat(findText(c, "nConstraintValue")); }
      catch { throw new BubbleRefusal("the held temperature is not a number."); }
    }
  }
  if (Tconst === null && tvars.length !== 1)
    throw new BubbleRefusal("NO STATED TEMPERATURE: neither a temperature constraint "
      + "nor exactly one temperature variable.");
  const tvar = tvars.length ? tvars[0]! : null;
  if (tvar !== null && lastUnit(kinds.get(tvar)![1]) !== "k")
    throw new BubbleRefusal(`the temperature variable is in '${kinds.get(tvar)![1]}'; `
      + "only K is read.");
  const pts: [number, number, number][] = [];
  const uncert: (number | null)[] = [];
  for (const nv of findAll(pom, "NumValues")) {
    const xs = new Map<string, string>();
    for (const x of findAll(nv, "VariableValue"))
      xs.set(findText(x, "nVarNumber"), findText(x, "nVarValue"));
    if (!xs.has(xvar) || (tvar !== null && !xs.has(tvar)))
      throw new BubbleRefusal("a data point lacks the composition or the "
        + "temperature -- not a bubble-pressure curve.");
    let pval = "", uval = "";
    for (const pv of findAll(nv, "PropertyValue")) {
      if (findText(pv, "nPropNumber") === pnum) {
        pval = findText(pv, "nPropValue");
        uval = findText(pv, "nCombExpandUncertValue");
      }
    }
    if (!pval) continue;
    const T = tvar !== null ? pyFloat(xs.get(tvar)!) : Tconst!;
    pts.push([pyFloat(xs.get(xvar)!), T, pyFloat(pval)]);
    uncert.push(uval ? pyFloat(uval) : null);
  }
  if (pts.length < 2) throw new BubbleRefusal("fewer than two usable points");
  if (uncert.some((u) => u === null))
    throw new BubbleRefusal("NO STATED UNCERTAINTY: "
      + `${uncert.filter((u) => u === null).length} of ${pts.length} points `
      + "carry no expanded uncertainty on the pressure.");
  const Ts = [...new Set(pts.map(([, t]) => pyRound6(t)))].sort((a, b) => a - b);
  if (Ts.length > 1 && !multi)
    throw new BubbleRefusal("THE TEMPERATURE VARIES ACROSS THE POINTS "
      + `(${Ts.length} values, ${pyRepr(Ts[0]!)} .. ${pyRepr(Ts[Ts.length - 1]!)} K); this `
      + "reader takes one isotherm per block (a ruling is "
      + "needed to read a multi-isotherm block).");
  const seen = new Set<string>();
  let ndup = 0;
  for (const [x, t, p] of pts) {
    const ks = [x, pyRound6(t), p].map(fkey).join(",");
    if (seen.has(ks)) ndup++;
    seen.add(ks);
  }
  if (ndup)
    throw new BubbleRefusal(`${ndup} of ${pts.length} (x, T, P) rows repeat an `
      + "earlier row exactly; read the article before choosing "
      + "one copy.");
  const names = namesOf(root, members);
  if (!names.every(Boolean))
    throw new BubbleRefusal("a component could not be resolved to a compound name "
      + "by its RegNum; the axis of x1 would be a guess.");
  let level = "";
  for (const pr of findAll(pom, "Property"))
    if (findText(pr, "nPropNumber") === pnum) level = findText(pr, "nCombUncertLevOfConfid");
  const order = pts.map((_, k) => k)
    .sort((a, b) => cmpTuple([pts[a]![1], pts[a]![0]], [pts[b]![1], pts[b]![0]]) || a - b);
  const rec: BubblePRecord = {
    kind: "bubbleP",
    system: [names[0]!, names[1]!],
    members: [members[0]!, members[1]!],
    doi,
    points: order.map((k) => pts[k]!),
    uP: order.map((k) => uncert[k]!),
    uPLevel: level,
  };
  if (Ts.length === 1) rec.TK = Ts[0]!;
  else rec.isotherms = Ts;
  return rec;
}

function outcome<R>(f: () => R): BlockOutcome<R> {
  try { return f(); }
  catch (e) {
    if (e instanceof BubbleRefusal) return { refused: e.message };
    return { error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

export class ThermoMLRefusal extends Error {}

/** Read a whole file.  Refuses (ThermoMLRefusal) what the extractor refuses
 *  before it looks at a block: unparseable XML, an unknown root, the v5
 *  dialect.  Every block is then read BOTH ways and the outcome kept. */
export function readThermoML(text: string, opts: { multiIsotherm?: boolean } = {}): ThermoMLFile {
  let root: XmlNode;
  try { root = parseXml(text); }
  catch (e) {
    throw new ThermoMLRefusal(`not parseable XML: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (root.tag === "dataReport")
    throw new ThermoMLRefusal("this is the 'v5' dialect.  The bubble-point reader is "
      + "written against the published archive dialect only.");
  if (root.tag !== "DataReport")
    throw new ThermoMLRefusal(`unrecognised ThermoML root element <${root.tag}>; the `
      + "published archive dialect has <DataReport>.");
  const doi = findText(root, "sDOI");
  const blocks = findAll(root, "PureOrMixtureData").map((pom, index): ThermoMLBlock => ({
    index,
    nComponents: findAll(pom, "Component").length,
    properties: [...propsOf(pom).values()],
    bubbleT: outcome(() => readBubbleT(root, pom, doi)),
    bubbleP: outcome(() => readBubbleP(root, pom, doi, !!opts.multiIsotherm)),
  }));
  return {
    doi,
    title: findText(root, "sTitle"),
    journal: findText(root, "sPubName"),
    year: findText(root, "yrPubYr"),
    authors: findAll(root, "sAuthor").map((e) => pyStrip(e.text)).filter(Boolean),
    compounds: compoundsOf(root),
    blocks,
  };
}

/** extract_binary_bubble / extract_binary_bubbleP: with no block named, the
 *  ONE interpretable block or a refusal listing them (choosing is the
 *  curator's act); with one named, that block or its refusal.  The message
 *  is the extractor's. */
export function selectBlock(file: ThermoMLFile, kind: "bubbleT", block?: number): BubbleTRecord | Refusal;
export function selectBlock(file: ThermoMLFile, kind: "bubbleP", block?: number): BubblePRecord | Refusal;
export function selectBlock(
  file: ThermoMLFile, kind: "bubbleT" | "bubbleP", block?: number,
): BubbleTRecord | BubblePRecord | Refusal {
  const T = kind === "bubbleT";
  if (!file.blocks.length) return { refused: "the file declares no <PureOrMixtureData> block" };
  let blocks = file.blocks;
  if (block !== undefined) {
    if (!(block >= 0 && block < blocks.length))
      return { refused: T
        ? `--block ${block} is out of range: this file has `
          + `${blocks.length} dataset block(s), numbered 0..${blocks.length - 1}`
        : `--block ${block} is out of range (0..${blocks.length - 1})` };
    blocks = [blocks[block]!];
  }
  const ok: [number, BubbleTRecord | BubblePRecord][] = [];
  const refusals: [number, string][] = [];
  for (const b of blocks) {
    const o = T ? b.bubbleT : b.bubbleP;
    if (isReaderError(o)) return { refused: o.error };
    if (isRefusal(o)) refusals.push([b.index, o.refused]);
    else ok.push([b.index, o]);
  }
  if (ok.length === 1) return ok[0]![1];
  if (ok.length > 1) {
    if (!T)
      return { refused: `this file carries ${ok.length} interpretable bubble-pressure `
        + "datasets; name one with `--block N`: " + ok.map(([i]) => String(i)).join(", ") };
    const listing = ok.map(([i, r0]) => {
      const r = r0 as BubbleTRecord;
      return `      --block ${i}   ${r.system[0]} + ${r.system[1]}, ${r.points.length} points, `
        + (r.isobars
          ? `${r.isobars.length} isobars ${pyRepr(Math.min(...r.isobars))}..${pyRepr(Math.max(...r.isobars))} kPa`
          : `${pyRepr(r.PkPa!)} kPa`);
    }).join("\n");
    return { refused: `this file carries ${ok.length} interpretable bubble-point`
      + " dataset(s), and choosing among them is the CURATOR's act, not"
      + " this tool's:\n" + listing + "\n    Name one with `--block N`." };
  }
  if (T)
    return { refused: `none of this file's ${refusals.length} dataset block(s) is a binary`
      + " bubble-point series:\n" + refusals.map(([i, w]) => `      block ${i}: ${w}`).join("\n") };
  return { refused: `none of this file's ${refusals.length} block(s) is an `
    + "isothermal bubble-pressure series:\n"
    + refusals.map(([i, w]) => `      block ${i}: ${w}`).join("\n") };
}

// =============================================================================
//  4. WHAT THE EXTRACTOR WRITES: interior points and the data rows
// =============================================================================

/** --interior-only (extract-vle) and extract-px's own rule: the pure
 *  endpoints x = 0 and x = 1 are set aside (they measure the vapour-pressure
 *  correlation, not the pair).  Indices into `points`, in order. */
export function interiorIndices(points: readonly (readonly number[])[]): number[] {
  return points.map((p, k) => (0 < p[0]! && p[0]! < 1 ? k : -1)).filter((k) => k >= 0);
}

/** The `data ( ... );` rows extract-vle writes (no vapour column): x to four
 *  decimals in a width of 8, the pressure column when it varies, T to six
 *  significant figures -- the numbers the fit then reads. */
export function bubbleTDataRows(rec: BubbleTRecord, keep: readonly number[]): string[] {
  return keep.map((k) => {
    const [x, t] = rec.points[k]!;
    let row = `    ${pyFixedW(x, 8, 4)}`;
    if (rec.PkPaPerPoint) row += `  ${pyFixedW(rec.PkPaPerPoint[k]!, 10, 4)}`;
    row += `  ${pyG(t, 6)}`;
    return row;
  });
}

/** The `data ( ... );` rows extract-px writes. */
export function bubblePDataRows(rec: BubblePRecord, keep: readonly number[]): string[] {
  return keep.map((k) => {
    const [x, t, p] = rec.points[k]!;
    let row = `    ${pyFixedW(x, 8, 4)}`;
    if (rec.isotherms) row += `  ${pyFixedW(t, 10, 4)}`;
    row += `  ${pyG(p, 6)}`;
    return row;
  });
}

/** The uncertainty `values ( ... )` list either extractor writes, `{v:g}`. */
export function uncertaintyValues(u: readonly (number | null)[], keep: readonly number[]): string | null {
  const vs = keep.map((k) => u[k]);
  if (vs.some((v) => v === null || v === undefined)) return null;
  return vs.map((v) => pyG(v!, 6)).join(" ");
}
