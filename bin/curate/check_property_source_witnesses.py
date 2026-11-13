#!/usr/bin/env python3
"""Gate: the liquid-property sources a unit records carry their own id AND their own words.

    bin/curate/check_property_source_witnesses.py            # check
    bin/curate/check_property_source_witnesses.py --write    # re-pin the words (say why in the commit)

WHY THIS EXISTS (DEV.md 4c C378 slice 0; the door review's DR-11 and the
re-review's DX-03).  A unit that computes a liquid property itself records
WHICH tagged source it used (core/PropertySourceLog.H).  The tag carries its
own words, so the words cannot drift from the number -- but the SITE chooses
the tag, and a site that picks the wrong one (the pump recording "a
component without a volume adds none" for pure water) is seen by no value,
no bench and no golden until the goldens carry `source` rows.  And a site
may build a source of its own, `NamedSource{ <id>, <words> }`, keeping an
existing tag's id beside other words: rankine02's feed pump then printed
"scaled to temperature by Rackett" beside a 25 C value, with every gate that
holds only the id green (the re-review's SB-NEW).

FOUR ARMS.
  (a) SOURCE.  Every `NamedSource{` / `ConstantSource{` built in src/ outside
      the header (statement level: comments blanked, the braces matched
      across lines) is read.  One that pairs `liquidSource::<tag>.id` with
      anything other than `liquidSource::<tag>.label` FAILS.  One whose id is
      a string literal is LISTED and counted per file against
      bin/curate/property_source_words.tsv (`inlineLiteral` rows): a new one
      is a deliberate act, re-pinned with `--write`.  Any other shape FAILS
      (the gate cannot judge it).
  (b) WITNESSES.  One case per source class is run, live, and the `sourceId`
      each unit publishes is held against bin/curate/property_source_witnesses.tsv.
  (c) WORDS AT RUN TIME.  In every witness run, each published
      `propertySources.used[*]` entry whose `sourceId` is a tag declared in
      the header must publish that tag's words: the JSON `label` is the
      tag's label (or the same words with "25 C molar volume" completed by
      the datum temperature, `liquidSource::labelAtDatum`), followed by
      nothing or by "; ..." (a site's addendum, the pressure and left-out
      notes of PropertySourceLog::sourceText).  Where two tags share an id
      (`fallback.1000`) either tag's words are accepted.
  (d) WORDS PIN.  Every tag of `namespace liquidSource` (name, id, words) is
      pinned in bin/curate/property_source_words.tsv (`tag` rows): a label
      edited in the header fails until the pin moves in the same commit, as
      a golden does.

WHAT IT DOES NOT CHECK.  Cases other than the witnesses (the goldens'
`source` rows hold their ids, not their words); whether a source is the
right physics; the WORDS of an addendum a site appends after "; "; a
`PropertySourceLog::use(...)` call handed its own id and words as strings
(today the door alone, whose ids -- `liquidVolume.idealMix[<routes>]`, the
viscosity and surface-tension method names -- and labels are built in
src/thermo/LiquidPropertyDoor.cpp and held per state by
check_property_route_bench's label hashes, bin/curate/property_route_labels.sha256.tsv;
and the laboratory analysis, which passes the tag object).

SABOTAGES, by hand (2026-11-13), each restored before the next:
  1. src/unitOperations/rotating/Pump.cpp records
     `NamedSource{ liquidSource::recordVliqFlat.id, "<the anchored Rackett
     route's words>" }` (the re-review's SB-NEW), built: CAUGHT by (a)
     (Pump.cpp:330, a tag's id beside other words) and by (c) on
     pump01_water and aceticAcid02_plant's methanolPump.
  2. the words of `declaredByCase` edited in src/core/PropertySourceLog.H
     (not built): CAUGHT by (d), naming the tag.  (c) fired too, only
     because the binaries were older than the header; built, (d) alone
     would.
  3. a new `NamedSource{ "own.literal", "..." }` appended to Pump.cpp:
     CAUGHT by (a), the file's string-literal count above its pin.
  Known to SURVIVE, by construction (in NOT CHECKED above): the right tag
  with false words appended after "; " as an addendum.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TABLE = ROOT / "bin" / "curate" / "property_source_witnesses.tsv"
WORDS = ROOT / "bin" / "curate" / "property_source_words.tsv"
HEADER = ROOT / "src" / "core" / "PropertySourceLog.H"
NAME = "check_property_source_witnesses"
RESULT = re.compile(r"<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>", re.S)
STRING_LIT = re.compile(r'"((?:\\.|[^"\\])*)"')
COMMENTS = re.compile(r'//[^\n]*|/\*.*?\*/|"(?:\\.|[^"\\])*"', re.S)


def blank_comments(text):
    """Comments removed, string literals kept (a `//` inside a string is not one)."""
    return COMMENTS.sub(lambda m: m.group(0) if m.group(0).startswith('"')
                        else "\n" * m.group(0).count("\n"), text)


def c_string(expr):
    """The value of an expression made only of adjacent string literals, else None."""
    rest = STRING_LIT.sub("", expr).strip()
    if rest:
        return None
    parts = STRING_LIT.findall(expr)
    if not parts:
        return None
    return "".join(re.sub(r"\\(.)", r"\1", p) for p in parts)


def braced(text, open_brace):
    """The top-level comma-separated items of the `{...}` at `open_brace`."""
    depth, items, cur, i = 0, [], [], open_brace
    while i < len(text):
        c = text[i]
        if c == '"':
            m = STRING_LIT.match(text, i)
            cur.append(m.group(0))
            i = m.end()
            continue
        if c in "([{":
            depth += 1
            if depth == 1:
                i += 1
                continue
        elif c in ")]}":
            depth -= 1
            if depth == 0:
                items.append("".join(cur).strip())
                return items
        elif c == "," and depth == 1:
            items.append("".join(cur).strip())
            cur = []
            i += 1
            continue
        cur.append(c)
        i += 1
    return None


def header_tags():
    """name -> (id, words) for every tag of `namespace liquidSource`."""
    text = blank_comments(HEADER.read_text())
    tags = {}
    for m in re.finditer(r"inline\s+const\s+(ConstantSource|NamedSource)\s+(\w+)\s*\{", text):
        items = braced(text, m.end() - 1)
        if items is None:
            continue
        if m.group(1) == "ConstantSource":
            items = items[1:]
        if len(items) != 2:
            continue
        sid, words = c_string(items[0]), c_string(items[1])
        if sid is not None and words is not None:
            tags[m.group(2)] = (sid, words)
    return tags


def site_constructions():
    """(file, line, verdict, text) for every NamedSource/ConstantSource built
    outside the header.  verdict: ok | mismatch | literal | unjudged."""
    out = []
    for base in (ROOT / "src",):
        for p in sorted(base.rglob("*")):
            if p.suffix not in (".cpp", ".H") or p == HEADER or not p.is_file():
                continue
            text = blank_comments(p.read_text(errors="replace"))
            for m in re.finditer(r"\b(NamedSource|ConstantSource)\s*\{", text):
                if re.search(r"inline\s+const\s+\w+\s+\w+\s*$", text[:m.start()][-80:]):
                    continue
                items = braced(text, m.end() - 1)
                rel = p.relative_to(ROOT).as_posix()
                line = text.count("\n", 0, m.start()) + 1
                shown = " ".join((items or ["?"]))[:140]
                if items and m.group(1) == "ConstantSource":
                    items = items[1:]
                if not items or len(items) != 2:
                    out.append((rel, line, "unjudged", shown))
                    continue
                a = re.fullmatch(r"(?:Choupo::)?liquidSource::(\w+)\.id", items[0])
                if a:
                    b = re.fullmatch(r"(?:Choupo::)?liquidSource::(\w+)\.label", items[1])
                    out.append((rel, line, "ok" if b and b.group(1) == a.group(1) else "mismatch",
                                shown))
                elif c_string(items[0]) is not None:
                    out.append((rel, line, "literal", shown))
                else:
                    out.append((rel, line, "unjudged", shown))
    return out


def words_rows(tags, sites):
    lines = ["# kind\tkey\tid\twords -- check_property_source_witnesses arms (a) and (d) (C378, re-review DX-03);",
             "# `tag` rows: every liquidSource tag's id and words; `inlineLiteral` rows: string-literal ids built at a site, per file.",
             "# Re-pin with --write, in the commit that changes them, and say why."]
    for name in sorted(tags):
        sid, words = tags[name]
        lines.append(f"tag\t{name}\t{sid}\t{words}")
    per = {}
    for f, _, v, _ in sites:
        if v == "literal":
            per[f] = per.get(f, 0) + 1
    for f in sorted(per):
        lines.append(f"inlineLiteral\t{f}\t{per[f]}")
    return lines


def run(case: Path):
    app = "choupoSolve"
    m = re.search(r"^\s*application\s+(\w+)\s*;",
                  (case / "system" / "controlDict").read_text(errors="replace"), re.M)
    if m:
        app = m.group(1)
    exe = ROOT / app
    if not exe.exists():
        return None, f"{exe} missing -- build the tree"
    env = dict(os.environ, CHOUPO_HOME=str(ROOT), LC_ALL="C")
    with tempfile.TemporaryDirectory() as tmp:
        dst = Path(tmp) / case.name
        shutil.copytree(case, dst)
        p = subprocess.run([str(exe), "."], cwd=dst, env=env, capture_output=True,
                           text=True, timeout=900)
    blocks = RESULT.findall(p.stdout)
    if not blocks:
        return None, f"no result block (exit {p.returncode})"
    #  The whole block: `used` (each entry with its id and words) and what
    #  each unit `declared` at assembly (review DX-06).
    return (json.loads(blocks[-1]).get("propertySources") or {}), None


def at_datum_pattern(words):
    """The tag's words, or the same with `labelAtDatum`'s completion."""
    key = "25 C molar volume"
    pat = re.escape(words)
    if key in words:
        at = words.index(key)
        end = at + len(key)
        plural = words[end:end + 1] == "s"
        tail = words[end + (1 if plural else 0):]
        alt = (re.escape(words[:at]) + ("molar volumes" if plural else "molar volume")
               + r" at the temperature its record states \([^)]*; any other at 25 C\)"
               + re.escape(tail))
        pat = f"(?:{pat}|{alt})"
    return re.compile(pat + r"(?:; .*)?", re.S)


def main() -> int:
    tags = header_tags()
    sites = site_constructions()
    if len(tags) < 10:
        print(f"{NAME}: FAIL -- only {len(tags)} tags read from {HEADER.relative_to(ROOT)}; "
              "a collapsed parse cannot vouch for anything")
        return 1
    if "--write" in sys.argv[1:]:
        WORDS.write_text("\n".join(words_rows(tags, sites)) + "\n")
        print(f"{NAME}: WROTE {len(tags)} tag(s) and the inline-literal counts to "
              f"{WORDS.relative_to(ROOT)}")
        return 0
    bad = []
    # (a) the site constructions
    for f, line, v, shown in sites:
        if v == "mismatch":
            bad.append(f"(a) {f}:{line}: a tag's id beside other words: {shown}")
        elif v == "unjudged":
            bad.append(f"(a) {f}:{line}: a source construction the gate cannot judge: {shown}")
    pinned_tags, pinned_lit = {}, {}
    if not WORDS.exists():
        print(f"{NAME}: FAIL -- {WORDS.relative_to(ROOT)} is missing (--write)")
        return 1
    for row in WORDS.read_text().splitlines():
        if not row or row.startswith("#"):
            continue
        kind, key, sid, words = (row.split("\t") + ["", "", "", ""])[:4]
        if kind == "tag":
            pinned_tags[key] = (sid, words)
        elif kind == "inlineLiteral":
            pinned_lit[key] = int(sid)
    lit_now = {}
    for f, _, v, _ in sites:
        if v == "literal":
            lit_now[f] = lit_now.get(f, 0) + 1
    for f in sorted(set(lit_now) | set(pinned_lit)):
        if lit_now.get(f, 0) != pinned_lit.get(f, 0):
            bad.append(f"(a) {f}: {lit_now.get(f, 0)} source(s) built with a string-literal id, "
                       f"pinned {pinned_lit.get(f, 0)} -- a tag in core/PropertySourceLog.H, or "
                       "--write in this commit, saying why")
    # (d) the words pin
    for name in sorted(set(tags) | set(pinned_tags)):
        if tags.get(name) != pinned_tags.get(name):
            bad.append(f"(d) tag {name}: the header says {tags.get(name)!r}, "
                       f"the pin says {pinned_tags.get(name)!r}")
    # (b), (c) the witnesses
    rows = []
    for line in TABLE.read_text().splitlines():
        if line and not line.startswith("#"):
            rows.append(line.split("\t"))
    if len(rows) < 5:
        print(f"{NAME}: FAIL -- {TABLE.relative_to(ROOT)} holds {len(rows)} witness rows")
        return 1
    by_id = {}
    for sid, words in tags.values():
        by_id.setdefault(sid, []).append(at_datum_pattern(words))
    cases, nwords = {}, 0
    for case, unit, prop, sid in rows:
        if case not in cases:
            cases[case] = run(ROOT / case)
            ps, err = cases[case]
            if err:
                continue
            for u in ps.get("used", []):
                pats = by_id.get(u.get("sourceId"))
                if pats is None:
                    continue
                nwords += 1
                if not any(p.fullmatch(u.get("label", "")) for p in pats):
                    bad.append(f"(c) {case}: {u['unit']} {u['property']} published "
                               f"{u['sourceId']!r} with the words {u.get('label')!r}, "
                               "not that tag's")
        ps, err = cases[case]
        if err:
            bad.append(f"(b) {case}: {err}")
            continue
        used = ps.get("used", [])
        #  A unit may take one property from several sources (a pore-model
        #  module: the case's declared film diffusivity AND the ions' D0), so
        #  the witness holds a SET per (unit, property); a row whose fourth
        #  column reads `declared:<class>` holds what the unit declared.
        got = {}
        for u in used:
            got.setdefault((u["unit"], u["property"]), set()).add(u["sourceId"])
        for d in ps.get("declared", []):
            got.setdefault((d["unit"], d["property"]), set()).add("declared:" + d["class"])
        if sid not in got.get((unit, prop), set()):
            bad.append(f"(b) {case}: {unit} {prop} published {sorted(got.get((unit, prop), set()))!r}, "
                       f"the witness says {sid!r}")
    if bad:
        print(f"{NAME}: FAIL -- {len(bad)} finding(s)")
        for b in bad:
            print("  " + b)
        return 1
    npair = sum(1 for s in sites if s[2] == "ok")
    print(f"{NAME}: OK -- (a) {len(sites)} source(s) built outside "
          f"{HEADER.relative_to(ROOT)}: {npair} pair a tag's id with that tag's words, "
          f"{sum(lit_now.values())} with a string-literal id (pinned per file); (b) "
          f"{len(rows)} (unit, property) sources in {len(cases)} witness case(s) are the tags "
          f"their code takes; (c) the {nwords} published entries carrying a header tag's id "
          f"carry its words; (d) the words of all {len(tags)} tags match "
          f"{WORDS.relative_to(ROOT)}.  NOT CHECKED: any case outside the witnesses, whether "
          "a source is right, an addendum's words after '; ', and the door's own ids and "
          "labels (held by check_property_route_bench's label hashes).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
