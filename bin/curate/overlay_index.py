#!/usr/bin/env python3
# -----------------------------------------------------------------------------
#  overlay_index.py  --  provenance INDEX + datum-drift scan over .dat overlays
#
#  Choupo lets the SAME logical datum live in many places: the standard library
#  (data/standards/...), a case-local overlay (<case>/constant/...), and a
#  per-unit overlay (<case>/<unit>/constant/...).  That flexibility is good for
#  authoring but invites DATUM DRIFT -- two copies of ethanol-water NRTL, or of
#  water.dat, that quietly disagree.  The C++ engine already announces, per RUN,
#  where each datum resolved from (the `[overlay]` line + the PairResolution log
#  surfaced in the GUI).  This script is the CURATION-TIME complement: a
#  repo-wide, read-only view that GROUPS every overlay by the datum it carries
#  and FLAGS the groups whose values disagree.
#
#  It invents NO new provenance scheme: it reads the SAME `.dat` files and their
#  existing `provenance { source ...; }` block, and compares the numeric values
#  already in them.  Output is a generated Markdown index; exit code is non-zero
#  when drift is found, so it can gate a curation review like runTests gates a
#  solve.
#
#  Usage:
#     bin/curate/overlay_index.py                 # scan data/standards + tutorials
#     bin/curate/overlay_index.py PATH ...        # scan given roots (e.g. a case)
#     bin/curate/overlay_index.py --md INDEX.md   # also write the index to a file
#     bin/curate/overlay_index.py --drift-only    # report only the drifting groups
# -----------------------------------------------------------------------------
import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

# ---- minimal .dat reader -----------------------------------------------------
# A Choupo .dat is a hierarchical dict (`key value;`, sub-dicts `{...}`).  We do
# NOT need a full parser: for drift we compare the NUMERIC scalar assignments,
# keyed by their dotted path, plus we pick up `provenance.source`.
_COMMENT = re.compile(r"//.*?$|/\*.*?\*/", re.MULTILINE | re.DOTALL)
_NUMBER  = re.compile(r"^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$")


def scalars_and_provenance(text):
    """Return ({dotted_key: first_numeric_token}, provenance_source_or_None)."""
    text = _COMMENT.sub(" ", text)
    scalars, stack, prov = {}, [], None
    # tokenise on braces/semicolons while tracking the sub-dict path
    tok = re.findall(r"\{|\}|[^{};]+;|[^{};]+(?=\{)", text)
    for t in tok:
        t = t.strip()
        if t == "{":
            continue
        if t == "}":
            if stack:
                stack.pop()
            continue
        if t.endswith("{") or (t and not t.endswith(";") and "{" not in t and ";" not in t):
            # a sub-dict header: "name {"  ->  push the name
            name = t.replace("{", "").strip().split()[0] if t.replace("{", "").strip() else ""
            stack.append(name)
            continue
        if t.endswith(";"):
            parts = t[:-1].split()
            if len(parts) >= 2:
                key, val = parts[0], parts[1]
                path = ".".join([p for p in stack if p] + [key])
                if _NUMBER.match(val):
                    scalars[path] = val
                if key == "source" and stack and stack[-1] == "provenance":
                    prov = " ".join(parts[1:]).strip('"')
    return scalars, prov


# ---- datum identity ----------------------------------------------------------
def datum_id(path: Path):
    """Logical identity of an overlay file: ('component', name) or
    ('pair', MODEL, pair), or None if the path is not an overlay we group."""
    parts = path.parts
    if "components" in parts and path.suffix == ".dat":
        return ("component", path.stem)
    if "binaryPairs" in parts and path.suffix == ".dat":
        i = parts.index("binaryPairs")
        model = parts[i + 1] if i + 1 < len(parts) - 1 else "?"
        return ("pair", model, path.stem)
    return None


def scope_of(path: Path):
    s = str(path)
    if "/standards/" in s or "/data/standards/" in s:
        return "standard"
    # per-unit overlay: .../<case>/<unit>/constant/...  (constant not directly under case)
    if "/constant/" in s:
        return "overlay"
    return "other"


def main():
    ap = argparse.ArgumentParser(description="Provenance index + drift scan over .dat overlays")
    ap.add_argument("roots", nargs="*", help="roots to scan (default: data/standards tutorials)")
    ap.add_argument("--md", metavar="FILE", help="also write the Markdown index to FILE")
    ap.add_argument("--drift-only", action="store_true", help="report only drifting groups")
    args = ap.parse_args()

    repo = Path(__file__).resolve().parents[2]
    roots = [Path(r) for r in args.roots] or [repo / "data/standards", repo / "tutorials"]

    groups = defaultdict(list)   # datum_id -> [ (path, scalars, prov, scope) ]
    for root in roots:
        if not root.exists():
            continue
        for f in root.rglob("*.dat"):
            did = datum_id(f)
            if did is None:
                continue
            try:
                sc, prov = scalars_and_provenance(f.read_text(errors="replace"))
            except OSError:
                continue
            groups[did].append((f.relative_to(repo) if repo in f.parents else f, sc, prov, scope_of(f)))

    drift, dup, unique = [], [], []
    for did, occ in groups.items():
        if len(occ) < 2:
            unique.append((did, occ))
            continue
        # compare numeric values on shared keys across the copies
        conflict = {}
        keys = set().union(*[set(s.keys()) for _, s, _, _ in occ])
        for k in keys:
            vals = {s[k] for _, s, _, _ in occ if k in s}
            if len(vals) > 1:
                conflict[k] = sorted(vals)
        (drift if conflict else dup).append((did, occ, conflict))

    # ---- render ----
    out = []
    out.append("# Overlay provenance index\n")
    out.append(f"Scanned {sum(len(v) for v in groups.values())} `.dat` overlays "
               f"in {len(groups)} logical datums "
               f"({len(drift)} DRIFT, {len(dup)} duplicate, {len(unique)} unique).\n")

    if drift:
        out.append("## ⚠️  DRIFT — same datum, disagreeing values (curation review)\n")
        for did, occ, conflict in sorted(drift):
            out.append(f"### `{' / '.join(did)}`")
            for path, _, prov, scope in sorted(occ, key=lambda x: str(x[0])):
                out.append(f"- `{path}`  ({scope}{', prov=' + prov if prov else ''})")
            for k, vals in sorted(conflict.items()):
                out.append(f"  - **{k}**: {' vs '.join(vals)}")
            out.append("")

    if not args.drift_only:
        if dup:
            out.append("## Duplicate — same datum, consistent values (redundant copies)\n")
            for did, occ, _ in sorted(dup):
                paths = ", ".join(f"`{p}`" for p, _, _, _ in sorted(occ, key=lambda x: str(x[0])))
                out.append(f"- `{' / '.join(did)}` ×{len(occ)}: {paths}")
            out.append("")

    text = "\n".join(out)
    print(text)
    if args.md:
        Path(args.md).write_text(text)
        print(f"\n[written: {args.md}]", file=sys.stderr)

    if drift:
        print(f"\nDRIFT in {len(drift)} datum(s) — curation review needed.", file=sys.stderr)
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
