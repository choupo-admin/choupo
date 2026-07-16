#!/usr/bin/env python3
"""Generate generated/releaseInventory.json -- the SINGLE SOURCE OF TRUTH for the
release's quantitative claims (homepage hero, "What is included", README, /models).

Counts ONLY what is actually active + distributed in the public release: the
curated data/standards/ tree, the registered engine models, and the runnable
tutorials.  Excludes READMEs, templates, generated outputs, expected files, and
data/local (private).  Nothing here is hand-written -- bump the catalogue and
re-run; the numbers follow.

Usage:  bin/curate/release_inventory.py            # writes generated/releaseInventory.json
        bin/curate/release_inventory.py --check    # exit 1 if the file is stale
"""
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards"
OUT = ROOT / "generated" / "releaseInventory.json"


def count_dat(rel: str) -> int:
    d = STD / rel
    return len(list(d.glob("*.dat"))) if d.is_dir() else 0


def count_dat_recursive(rel: str) -> int:
    d = STD / rel
    return len(list(d.rglob("*.dat"))) if d.is_dir() else 0


def count_catalogue_records(rel: str, block: str) -> int:
    """Records in a single list-of-dicts catalogue file (e.g. species/aqueous.dat)."""
    f = STD / rel
    if not f.is_file():
        return 0
    txt = f.read_text()
    m = re.search(block + r"\s*\((.*)\)\s*;", txt, re.S)
    body = m.group(1) if m else txt
    # each record carries exactly one `charge` field
    return len(re.findall(r"^\s*charge\b", body, re.M))


def count_registered(cpp_rel: str) -> int:
    """`reg("name", ...)` builtins registered in a factory .cpp."""
    f = ROOT / cpp_rel
    if not f.is_file():
        return 0
    return len(re.findall(r'\breg\(\s*"', f.read_text()))


def release_id() -> str:
    b = (ROOT / "src" / "core" / "Banner.H").read_text()
    m = re.search(r'CHOUPO_VERSION\s*=\s*"([^"]+)"', b)
    return m.group(1) if m else "unknown"


def count_runnable_cases() -> int:
    """A runnable case = a `system/controlDict` that declares an `application`
    (the binary to dispatch).  This excludes fractal sub-unit / sector folders
    (which inherit and carry no application) so we count TOP-LEVEL cases only."""
    n = 0
    for cd in (ROOT / "tutorials").rglob("system/controlDict"):
        if re.search(r"^\s*application\b", cd.read_text(), re.M):
            n += 1
    return n


def released_at() -> str:
    """The release date, from the CHANGELOG header `## [Choupo-XXXX] — YYYY-MM-DD`."""
    ch = (ROOT / "CHANGELOG.md").read_text()
    rel = release_id()
    m = re.search(r"^##\s*\[" + re.escape(rel) + r"\]\s*[—-]+\s*([0-9]{4}-[0-9]{2}-[0-9]{2})",
                  ch, re.M)
    return m.group(1) if m else ""


def build() -> dict:
    tutorials = count_runnable_cases()
    regression = len(list((ROOT / "tutorials").rglob("expected")))
    inv = {
        "release": release_id(),
        "releasedAt": released_at(),
        "catalogue": {
            "components":        count_dat("components"),
            "aqueousSpecies":    count_catalogue_records("species/aqueous.dat", "aqueousSpecies"),
            "nrtlPairs":         count_dat("parameters/NRTL"),
            "wilsonPairs":       count_dat("parameters/Wilson"),
            "uniquacPairs":      count_dat("parameters/UNIQUAC"),
            "henryPairs":        count_dat("parameters/Henry"),
            "pitzerPairs":       count_dat("parameters/Pitzer/pairs"),
            "enrtlPairs":        count_dat("parameters/eNRTL"),
            "propertyMethods":   count_dat_recursive("methods"),
            "materials":         count_dat("materials"),
            "membranes":         count_dat("membranes"),
            "adsorbents":        count_dat("adsorbents"),
            "utilities":         count_dat("utilities"),
        },
        "engine": {
            "unitOperations":    count_registered("src/unitOperations/UnitOperation.cpp"),
            "engines":           4,  # choupoSolve / choupoBatch / choupoCtrl / choupoProps
        },
        "tutorials": {
            "runnableCases":     tutorials,
            "regressionChecks":  regression,
        },
    }
    c = inv["catalogue"]
    inv["totals"] = {
        # every binary/pair/Henry/electrolyte parameter record shipped
        "mixtureParameterRecords":
            c["nrtlPairs"] + c["wilsonPairs"] + c["uniquacPairs"] + c["henryPairs"]
            + c["pitzerPairs"] + c["enrtlPairs"],
    }
    return inv


def main():
    inv = build()
    payload = json.dumps(inv, indent=2, sort_keys=False) + "\n"
    if "--check" in sys.argv:
        current = OUT.read_text() if OUT.is_file() else ""
        if current != payload:
            print("release inventory is STALE -- run bin/curate/release_inventory.py", file=sys.stderr)
            sys.exit(1)
        print("release inventory up to date")
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(payload)
    print(payload)


if __name__ == "__main__":
    main()
