#!/usr/bin/env python3
"""check_models_catalogue -- the public model catalogue must describe THIS tree.

`generated/modelsCatalogue.json` feeds the site's /models page: every entry
links a model to a source file and every databank entry states a record count.
It carried, until 2026-08-11, the sentence *"Machine-generated ... Every source
path and every tutorial name was verified to exist"* -- and by then NINE of its
databank paths pointed at directories the 2026-07-16 tree migrations had
retired (`binaryPairs/`, `henrysLaw/`, `materials/`, `membranes/`,
`adsorbents/`, `propertyMethods/`, ...), while `parameters/electrolyte/` was
credited with 124 records and holds none.  Nobody saw it because nothing
recomputed the claim: a verification stated once and then remembered is a
derived fact with a second home, which is the arity sin the doctrine names.

So this gate recomputes, from the tree, on every run:

  1. every `source` value that names a FILE exists;
  2. every `source` value that names a DIRECTORY exists;
  3. every databank `count` equals the number of `.dat` records under its
     directory (recursive);
  4. every `tutorials` name resolves to a real case (a directory holding
     `system/controlDict`);
  5. no entry names a directory retired by the tree migrations;
  6. the catalogue does not call itself machine-generated while no generator
     exists in `bin/`.

WHAT THIS GATE DOES NOT CHECK, and a reader should not infer:
  * that the catalogue is COMPLETE -- a model registered in `registerBuiltins()`
    but absent from the JSON is invisible here.  Coverage of the factories is
    the next slice, not this one.
  * that a `name` or a `phases` field describes the model correctly.  Those are
    prose claims, and a path check cannot read prose.

Exit 0 on success, 1 with the failing entries named.
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CATALOGUE = ROOT / "generated" / "modelsCatalogue.json"

#  Directories the 2026-07-16 migrations retired.  A catalogue entry naming one
#  is stale by construction, whatever the filesystem happens to hold.
RETIRED = (
    "data/standards/binaryPairs/",
    "data/standards/henrysLaw/",
    "data/standards/materials/",
    "data/standards/membranes/",
    "data/standards/adsorbents/",
    "data/standards/propertyMethods/",
    "data/standards/methods/",
    "data/standards/propertySets/",
    "data/standards/components/apparent/",
    #  The deleted species-basis component home is deliberately NOT listed:
    #  naming it would mean writing the banned word, and check_glossary_bans
    #  is right to refuse that.  `components/` is flat, so any subdirectory
    #  under it fails the plain existence check anyway.
    "data/standards/phases/solid/",
    "data/standards/propertyPackages/",
)


def real_cases():
    return {p.parent.parent.name
            for p in ROOT.glob("tutorials/**/system/controlDict")}


def main():
    if not CATALOGUE.exists():
        print(f"check_models_catalogue: FAIL -- {CATALOGUE} is missing")
        return 1

    doc = json.loads(CATALOGUE.read_text())
    cases = real_cases()
    fails = []
    n_src = n_count = n_tut = 0

    for category, items in doc.get("categories", {}).items():
        for item in items:
            key = f"{category}/{item.get('key', '?')}"

            src = item.get("source")
            if src:
                n_src += 1
                for bad in RETIRED:
                    if src.startswith(bad):
                        fails.append(
                            f"{key}: source '{src}' names a directory retired by "
                            f"the tree migrations")
                        break
                else:
                    if not (ROOT / src).exists():
                        fails.append(f"{key}: source '{src}' does not exist")

            if "count" in item and src:
                n_count += 1
                d = ROOT / src
                if d.is_dir():
                    have = len(list(d.rglob("*.dat")))
                    if have != item["count"]:
                        fails.append(
                            f"{key}: count says {item['count']}, the tree holds "
                            f"{have} .dat records under '{src}'")

            for t in item.get("tutorials", []):
                n_tut += 1
                if t not in cases:
                    fails.append(f"{key}: tutorial '{t}' is not a runnable case")

    #  The CLAIM, not the word: a note may legitimately say "it is NOT
    #  machine-generated" (the current one does, and says why).  Only the
    #  assertive form is a claim this gate can falsify.
    note = doc.get("note", "")
    if "Machine-generated from" in note or "machine-generated from" in note:
        generators = [p for p in (ROOT / "bin").rglob("*")
                      if p.is_file() and "modelsCatalogue" in p.read_bytes().decode(
                          "utf-8", "replace") and "check_models_catalogue" not in p.name
                      and "buildSite" not in p.name]
        if not generators:
            fails.append(
                "note claims the catalogue is machine-generated, but no generator "
                "that writes it exists under bin/ -- it is hand-curated, and a "
                "false claim of automation is exactly what let nine dead paths sit "
                "unnoticed")

    if fails:
        print("check_models_catalogue: FAIL")
        for f in fails:
            print(f"  - {f}")
        return 1

    print(f"check_models_catalogue: {n_src} source paths, {n_count} databank "
          f"counts and {n_tut} tutorial references all resolve against the tree "
          f"(does NOT check catalogue completeness or the prose of any `name`)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
