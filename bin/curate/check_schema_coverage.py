#!/usr/bin/env python3
"""Every operation schema must accept every shipped case that uses its op.

Design record: DEV.md section 5 debt 6.

A `.schema.json` is not decoration.  The GUI builds its property editor from
it, `bin/regen-llm-docs` copies it verbatim into the reference an assistant
reads, and both of those become WRONG the moment the schema and the engine
disagree.  The corpus is the arbiter: a case in `tutorials/` runs, so every key
it uses is real, and every key it omits is genuinely optional.

Two directions, and each catches a different lie:

  UNKNOWN KEY   a case uses a key the schema does not list.  Since every
                schema is `additionalProperties: false`, the schema would
                REJECT a case the engine runs happily -- and the GUI would
                offer no field for it.
  FALSE REQUIRED
                a schema marks a key required that a running case omits.  The
                engine defaults it; the schema claims it is mandatory.

This deliberately checks NAMES, not values: types and units are the schema's
own claim and the corpus cannot arbitrate them.  Parsing is brace-matching
over comment-stripped text -- enough for depth-1 key names, and it refuses
rather than guesses when the braces do not balance.

Exit 1 listing the disagreements."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMAS = ROOT / "gui" / "schemas" / "operations"

#  Structural keys of a unit/op entry -- the flowsheet grammar, not the
#  operation's own parameters.  The schema describes `operation { ... }`
#  (flowsheet units) or the op's own parameter keys (props ops); these are
#  neither, and listing them in a schema would be the grammar leaking in.
STRUCTURAL = {
    "name", "type", "model", "in", "inputs", "outputs", "operation",
    "boundary", "thermo", "reaction", "reactions", "crystallisation",
    "dryingCurve", "energyInputs", "energyOutputs", "designSpec",
    #  A provenance citation the AUTHOR writes for the reader: it appears on
    #  14 propsDict files and is read by no operation, so it is an annotation
    #  that survives into the dict, not a parameter any schema should claim.
    "source",
}

failures = []


def strip_comments(t: str) -> str:
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def block_after(text: str, start: int):
    """The {...} body that begins at or after `start`; None if unbalanced."""
    i = text.find("{", start)
    if i < 0:
        return None
    depth, j = 0, i
    while j < len(text):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return text[i + 1:j]
        j += 1
    return None


def top_keys(body: str) -> set:
    """Depth-1 keys of a dict body: `word value;` and `word { ... }`."""
    keys, depth, i = set(), 0, 0
    tok = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
    while i < len(body):
        c = body[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        elif c == "(":
            #  A list value: skip it wholesale, its contents are depth-2.
            d, i = 1, i + 1
            while i < len(body) and d:
                d += (body[i] == "(") - (body[i] == ")")
                i += 1
            continue
        elif depth == 0:
            m = tok.match(body, i)
            if m:
                #  A key is a word at depth 0 that is followed (after its
                #  value) by `;` or `{` or `(` -- and is the FIRST word of its
                #  statement.  Walk back: preceded only by whitespace since
                #  the last `;`, `{`, `}` or `)`.
                k = i - 1
                while k >= 0 and body[k] in " \t\n\r":
                    k -= 1
                if k < 0 or body[k] in ";{}()":
                    keys.add(m.group(0))
                i = m.end()
                continue
        i += 1
    return keys


def uses_in_flowsheets(op: str):
    """(case, keys) for every flowsheet unit of this type."""
    out = []
    for f in sorted(ROOT.glob("tutorials/**/system/flowsheetDict")):
        t = strip_comments(f.read_text(errors="replace"))
        for m in re.finditer(r"\btype\s+" + re.escape(op) + r"\s*;", t):
            #  The `operation { }` of THIS unit: the entry is brace-delimited,
            #  so search forward only to the end of the enclosing unit entry.
            seg = t[m.end():]
            om = re.search(r"\boperation\b", seg)
            #  Do not cross into the next unit.
            nxt = re.search(r"\btype\s+\w+\s*;", seg)
            if om and (not nxt or om.start() < nxt.start()):
                body = block_after(seg, om.end())
                if body is None:
                    failures.append(f"PARSE: unbalanced operation block for "
                                    f"'{op}' in {f.relative_to(ROOT)}")
                    continue
                out.append((f.relative_to(ROOT), top_keys(body)))
            else:
                out.append((f.relative_to(ROOT), set()))   # no operation block
    return out


def uses_in_props(op: str):
    """(case, keys) for every propsDict operation of this type."""
    out = []
    for f in sorted(ROOT.glob("tutorials/**/system/propsDict")):
        t = strip_comments(f.read_text(errors="replace"))
        #  Each op is a `{ ... }` entry in the operations list; find the entry
        #  containing this `type` by walking back to its opening brace.
        for m in re.finditer(r"\btype\s+" + re.escape(op) + r"\s*;", t):
            depth, i = 0, m.start()
            while i >= 0:
                if t[i] == "}":
                    depth += 1
                elif t[i] == "{":
                    if depth == 0:
                        break
                    depth -= 1
                i -= 1
            if i < 0:
                failures.append(f"PARSE: cannot find the entry holding "
                                f"'{op}' in {f.relative_to(ROOT)}")
                continue
            body = block_after(t, i)
            if body is None:
                failures.append(f"PARSE: unbalanced entry for '{op}' in "
                                f"{f.relative_to(ROOT)}")
                continue
            out.append((f.relative_to(ROOT), top_keys(body)))
    return out


BASELINE = ROOT / "bin" / "curate" / "schema_coverage_baseline.txt"


def load_baseline() -> set:
    """The disagreements that existed when this gate was written.

    A RATCHET, not a whitelist.  Anything NOT listed fails immediately, so no
    new disagreement can appear; and a listed entry that stops firing ALSO
    fails, so landing a fix forces the line out of the file.  The list can
    only shrink, and when it is empty this mechanism is deleted.
    """
    if not BASELINE.exists():
        return set()
    return {ln.strip() for ln in BASELINE.read_text().splitlines()
            if ln.strip() and not ln.startswith("#")}


def main() -> int:
    schemas = sorted(SCHEMAS.glob("*.schema.json"))
    if len(schemas) < 20:
        print(f"check_schema_coverage: only {len(schemas)} schemas found -- "
              "the scan is not working, refusing to pass on it")
        return 1

    checked = exercised = 0
    for sf in schemas:
        op = sf.name[:-len(".schema.json")]
        s = json.loads(sf.read_text())
        known = set(s.get("properties", {})) | STRUCTURAL
        required = set(s.get("required", []))
        uses = uses_in_flowsheets(op) + uses_in_props(op)
        if not uses:
            continue                      # not exercised by the corpus
        exercised += 1
        for case, keys in uses:
            checked += 1
            unknown = keys - known
            if unknown:
                failures.append(
                    f"UNKNOWN KEY: {op} in {case} uses "
                    f"{', '.join(sorted(unknown))} -- absent from "
                    f"{sf.name}, whose additionalProperties is false, so the "
                    "schema would reject a case the engine runs")
            missing = required - keys
            if missing:
                failures.append(
                    f"FALSE REQUIRED: {sf.name} marks "
                    f"{', '.join(sorted(missing))} required, but {case} runs "
                    "without it -- the engine defaults it, so the schema is "
                    "over-strict")

    base = load_baseline()
    fired = {f for f in failures if f in base}
    fresh = [f for f in failures if f not in base]
    stale = sorted(base - fired)

    if fresh or stale:
        print("check_schema_coverage: FAIL")
        for f in fresh:
            print("  - NEW:", f)
        for f in stale:
            print("  - FIXED (drop this line from"
                  f" {BASELINE.relative_to(ROOT)}):", f)
        return 1
    if base:
        print(f"check_schema_coverage: OK -- {len(schemas)} schema(s), "
              f"{exercised} exercised over {checked} case use(s); no NEW "
              f"disagreement.  {len(base)} pre-existing one(s) remain in "
              f"{BASELINE.name} and the gate fails the moment one is fixed "
              "without being struck from that file, so the list can only "
              "shrink")
    else:
        print(f"check_schema_coverage: OK -- {len(schemas)} schema(s), "
              f"{exercised} exercised by the corpus over {checked} case "
              "use(s); no schema rejects a key a running case uses, and none "
              "marks required a key a running case omits")
    return 0


if __name__ == "__main__":
    sys.exit(main())
