#!/usr/bin/env python3
"""Generate the CODE NAVIGATION MAP -- generated/codeMap.json.

    bin/curate/code_map.py            # regenerate
    bin/curate/code_map.py --check    # regenerate to memory, diff vs committed

WHAT THIS IS.  The searchable navigation aid of the operational memory
(Vitor's ruling, 2026-08-10): classes -> files, the REAL include graph, the
factory registries, the binaries.  It is a NAVIGATION AID, NOT ARCHITECTURAL
TRUTH -- the truth is the source; the ownership index and the ADRs carry the
contracts.  It is regenerated, never hand-maintained.

WHERE EACH PIECE COMES FROM, and what it can honestly claim:

  * classes/structs: a line-anchored textual scan of src/**/*.H -- it sees
    `class Foo` / `struct Foo` declarations at brace level style used in
    this tree.  It does NOT parse C++; templates, nested classes and macro
    tricks may be missed (this tree avoids all three by convention).
  * includes: the compiler's OWN -MMD output (build/linux64Gcc/**/*.d) --
    the one part that is ground truth, because make builds from it.  When
    the build tree is absent the script REFUSES (a map silently missing its
    strongest layer would look complete while being navigation-only).
  * factories: the `reg("key", ...)` / `registerType("key"` lines inside
    each base's registration TU.  This is also the STATIC-CALL-GRAPH
    DISCLAIMER made concrete: dispatch in this tree goes through virtuals
    and these registries, so "who calls whom" is NOT derivable statically
    and this map deliberately does not pretend to a call graph.  What it
    gives instead is "who REACHES whom at compile time" (includes) and
    "what name mints what type" (registries).
  * binaries: src/applications/*/main.cpp.

The `limitations` object in the JSON restates all of this next to the data,
so a consumer cannot read the map without reading its limits.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "src")
DEPS = os.path.join(ROOT, "build", "linux64Gcc")
OUT = os.path.join(ROOT, "generated", "codeMap.json")

CLASS_RE = re.compile(r"^\s*(?:class|struct)\s+([A-Z]\w+)\b(?!.*;\s*$)", re.M)
FWD_RE = re.compile(r"^\s*(?:class|struct)\s+[A-Z]\w+\s*;", re.M)


def rel(p):
    return os.path.relpath(p, ROOT)


def scan_classes():
    """class/struct name -> declaring header(s).  Line-anchored, textual."""
    classes = {}
    for dirpath, _, files in os.walk(SRC):
        for f in sorted(files):
            if not f.endswith(".H"):
                continue
            path = os.path.join(dirpath, f)
            text = open(path, encoding="utf-8", errors="replace").read()
            # drop pure forward declarations before matching
            text = FWD_RE.sub("", text)
            for name in CLASS_RE.findall(text):
                classes.setdefault(name, []).append(rel(path))
    return {k: sorted(set(v)) for k, v in sorted(classes.items())}


def scan_includes():
    """From the compiler's .d files: TU -> src headers it reaches, and the
    reverse map header -> TUs that reach it (the compile-time blast radius
    of editing that header)."""
    if not os.path.isdir(DEPS):
        return None, None
    fwd = {}
    for dirpath, _, files in os.walk(DEPS):
        for f in files:
            if not f.endswith(".d"):
                continue
            text = open(os.path.join(dirpath, f), encoding="utf-8",
                        errors="replace").read().replace("\\\n", " ")
            # 'target.o: dep dep dep' -- keep src/-relative deps only
            deps = []
            for part in text.split(":", 1)[1].split():
                if part.startswith("src/") and os.path.isfile(
                        os.path.join(ROOT, part)):
                    deps.append(part)
            if not deps:
                continue
            tu = deps[0]                      # first dep is the .cpp itself
            fwd[tu] = sorted(set(deps[1:]))
    rev = {}
    for tu, hdrs in fwd.items():
        for h in hdrs:
            rev.setdefault(h, []).append(tu)
    rev = {h: sorted(v) for h, v in sorted(rev.items())}
    return dict(sorted(fwd.items())), rev


def scan_factories():
    """Registration TUs: base -> [{key, type}].  The registry indirection is
    exactly where a static call graph lies, so it is surfaced as data."""
    factories = {}
    #  Key first; then resolve the minted type from the registration argument
    #  (everything up to the closing `);`): make_unique<T>, or T::create.  A
    #  registration whose body THROWS before minting anything is a retirement
    #  tombstone (e.g. the retired fitBinaryPair) -- recorded as
    #  {"refuses": true} so a null type means "mints nothing on purpose",
    #  never "the parser missed it".
    reg_re = re.compile(r'reg(?:isterType)?\s*\(\s*"([^"]+)"(.*?)\)\s*;',
                        re.S)
    for dirpath, _, files in os.walk(SRC):
        for f in sorted(files):
            if not f.endswith(".cpp"):
                continue
            path = os.path.join(dirpath, f)
            text = open(path, encoding="utf-8", errors="replace").read()
            if "registerBuiltins" not in text:
                continue
            body = text.split("registerBuiltins", 1)[1]
            entries = []
            for m in reg_re.finditer(body):
                key, arg = m.group(1), m.group(2)
                tm = (re.search(r"make_unique<\s*(\w+)", arg)
                      or re.search(r"(\w+)::create\b", arg)
                      or re.search(r"return\s+(\w+)\s*\(", arg))
                if tm:
                    entries.append({"key": key, "type": tm.group(1)})
                elif "throw" in arg:
                    entries.append({"key": key, "type": None,
                                    "refuses": True})
                else:
                    entries.append({"key": key, "type": ""})
            if entries:
                factories[rel(path)] = entries
    return dict(sorted(factories.items()))


def scan_binaries():
    apps = {}
    appdir = os.path.join(SRC, "applications")
    if os.path.isdir(appdir):
        for name in sorted(os.listdir(appdir)):
            main = os.path.join(appdir, name, "main.cpp")
            if os.path.isfile(main):
                apps[name] = rel(main)
    return apps


def build_map():
    fwd, rev = scan_includes()
    if fwd is None:
        print("ERROR: build/linux64Gcc has no .d files -- the include graph "
              "is the map's ground-truth layer and cannot be omitted "
              "silently.  Build first (make all), then regenerate.",
              file=sys.stderr)
        sys.exit(1)
    classes = scan_classes()
    return {
        "_generated_by": "bin/curate/code_map.py -- DO NOT EDIT (regenerate)",
        "limitations": {
            "classes": "line-anchored textual scan of src/**/*.H; not a C++ "
                       "parse (templates/nested/macro declarations unseen -- "
                       "avoided by convention in this tree)",
            "includes": "the compiler's own -MMD output; ground truth for "
                        "compile-time reach, silent about runtime reach",
            "callGraph": "DELIBERATELY ABSENT: dispatch goes through "
                         "virtuals and explicit factories, so a static call "
                         "graph would be wrong; use `factories` for the "
                         "name->type minting and `includesReverse` for the "
                         "compile-time blast radius",
            "freshness": "regenerate after moving/adding files; "
                         "check_code_map fails when stale",
        },
        "subsystems": sorted(d for d in os.listdir(SRC)
                             if os.path.isdir(os.path.join(SRC, d))),
        "binaries": scan_binaries(),
        "classes": classes,
        "factories": scan_factories(),
        "includes": fwd,
        "includesReverse": rev,
    }


def main():
    m = build_map()
    payload = json.dumps(m, indent=1, sort_keys=False) + "\n"
    if "--check" in sys.argv:
        if not os.path.isfile(OUT):
            print("code_map --check: FAILED -- generated/codeMap.json "
                  "missing; run bin/curate/code_map.py")
            sys.exit(1)
        if open(OUT, encoding="utf-8").read() != payload:
            print("code_map --check: STALE -- generated/codeMap.json does "
                  "not match the tree; run bin/curate/code_map.py")
            sys.exit(1)
        print(f"code_map --check: OK -- {len(m['classes'])} classes, "
              f"{len(m['includes'])} TUs, {len(m['factories'])} "
              f"registration TU(s) match the tree")
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8").write(payload)
    print(f"wrote {rel(OUT)}: {len(m['classes'])} classes, "
          f"{len(m['includes'])} TUs, "
          f"{sum(len(v) for v in m['factories'].values())} factory "
          f"registrations in {len(m['factories'])} TU(s), "
          f"{len(m['binaries'])} binaries")


if __name__ == "__main__":
    main()
