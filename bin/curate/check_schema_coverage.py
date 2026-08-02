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
    #  Annotations the AUTHOR writes for the reader, collected by
    #  choupoProps main for the report rather than by any operation: a
    #  provenance citation, a free-text reason, a provenance sub-dict.  They
    #  survive into the dict as documentation, so no schema should claim them.
    "source", "rationale", "provenance",
}

failures = []


def strip_comments(t: str) -> str:
    """Comments out, quoted STRINGS blanked.

    A string body is not grammar: `rationale "NRTL captures it"` is one key
    and a sentence, and reading the sentence for keys reported `NRTL` and
    `compare` as operation parameters of propertyScan1D.  Blanking (rather
    than deleting) keeps every offset, so a later brace scan still balances.
    A `//` inside a string is likewise not a comment.
    """
    out, i, n = [], 0, len(t)
    while i < n:
        if t.startswith("/*", i):
            j = t.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(" " * (j - i)); i = j
        elif t.startswith("//", i):
            j = t.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i)); i = j
        elif t[i] == '"':
            j = t.find('"', i + 1)
            j = n if j < 0 else j + 1
            out.append(" " * (j - i)); i = j
        else:
            out.append(t[i]); i += 1
    return "".join(out)


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


#  There WAS a baseline here: 82 disagreements across 18 schemas that
#  pre-dated this gate, held as a ratchet that could only shrink.  It was
#  cleared on 2026-08-02 and the mechanism was deleted with it, exactly as its
#  own header said it would be.  The gate now holds the plain contract: every
#  schema accepts every case that runs.  Do not reintroduce a baseline -- a
#  disagreement is a schema to fix, not a line to record.
def alias_groups():
    """Operation names that construct the SAME C++ class, from the registry.

    Derived, never hand-listed: the explicit reg("name", make_unique<Class>)
    calls ARE the aliasing (CLAUDE.md's no-macro registration makes the grep
    exact), so a new alias joins its group with no edit here.  Two names for
    one unit read one operation block, so their schemas must agree on
    `properties` and `required` -- the descriptions may differ (that is what
    an alias-specific note is for), the CONTRACT may not.  Without this, the
    alias copies were three files that had to stay equal with nothing making
    them: the standing drift of the arity doctrine, one directory over.
    """
    pairs = []
    for rel in ("src/unitOperations/UnitOperation.cpp",
                "src/propertyOps/PropertyOperation.cpp"):
        f = ROOT / rel
        if not f.is_file():
            print(f"check_schema_coverage: {rel} not found -- the registry "
                  "moved; fix the path here")
            sys.exit(1)
        pairs += re.findall(
            r'reg\("([A-Za-z0-9_]+)",\s*\[\]\{ return std::make_unique<'
            r"([A-Za-z0-9]+)>", f.read_text())
    by_cls = {}
    for name, cls in pairs:
        by_cls.setdefault(cls, []).append(name)
    return {cls: sorted(ns) for cls, ns in by_cls.items() if len(ns) > 1}


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

    # ---- completeness: every registered op carries a schema -------------
    #  Coverage climbed 32 -> 76 of 76 on 2026-08-02, batch by batch, each
    #  schema written from the op's source and a running case.  From here the
    #  requirement is STANDING: registering an operation and writing its
    #  schema are one act, because a schema-less op has no GUI property
    #  editor, no entry in the generated reference, and an assistant reading
    #  that reference concludes it does not exist.  (An alias satisfies this
    #  with its own file, kept equal to its canonical twin by the alias check
    #  below.)
    all_ops = set()
    for rel in ("src/unitOperations/UnitOperation.cpp",
                "src/propertyOps/PropertyOperation.cpp"):
        all_ops |= set(re.findall(r'reg\("([A-Za-z0-9_]+)"',
                                  (ROOT / rel).read_text()))
    have = {f.name[:-len(".schema.json")] for f in schemas}
    for op in sorted(all_ops - have, key=str.lower):
        failures.append(
            f"NO SCHEMA: operation '{op}' is registered but has no"
            " gui/schemas/operations/" + op + ".schema.json -- write it from"
            " the op's source and a running case (never from the header"
            " comment); the GUI and the generated reference are blind to the"
            " op until it exists")

    # ---- alias agreement: one class, one contract -----------------------
    nAlias = 0
    for cls, names in sorted(alias_groups().items()):
        have = [(n, SCHEMAS / f"{n}.schema.json") for n in names
                if (SCHEMAS / f"{n}.schema.json").exists()]
        if len(have) < 2:
            continue
        nAlias += 1
        ref_name, ref_path = have[0]
        ref = json.loads(ref_path.read_text())
        for n, sp in have[1:]:
            s = json.loads(sp.read_text())
            if (s.get("properties") != ref.get("properties")
                    or sorted(s.get("required", []))
                    != sorted(ref.get("required", []))):
                failures.append(
                    f"ALIAS DRIFT: {n} and {ref_name} both construct {cls} "
                    "and read the same operation block, but their schemas "
                    "disagree on properties/required -- one unit, one "
                    "contract; edit them together")

    if failures:
        print("check_schema_coverage: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print(f"check_schema_coverage: OK -- every one of the {len(all_ops)} "
          f"registered operations carries a schema ({exercised} exercised by "
          f"the corpus over {checked} case use(s)); no schema rejects a key a "
          "running case uses, none marks required a key a running case "
          f"omits, and {nAlias} registry-derived alias group(s) agree "
          "property-for-property")
    return 0


if __name__ == "__main__":
    sys.exit(main())
