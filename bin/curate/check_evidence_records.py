#!/usr/bin/env python3
"""check_evidence_records -- every measured DATASET the tree ships is readable
and cites its source, and the engine can be asked AT its points.

DEV.md 4c C117; docs/design/evidence-as-a-first-class-object.md section 7.
A dataset is EVIDENCE: a file in the grammar `bin/choupo-thermoml extract-vle`
writes (`property; system|component; provenance { citation; sha256; ...};
columns ( ); data ( )`), kept beside the record it was fitted to or compared
against -- in a tutorial's `constant/experiments/`, in `data/local/evidence/`
(private), or one day in `data/standards/evidence/`.  The Property Explorer's
Evidence view reads each file's own header and asks `choupoProps` for the
model at the measured conditions; it fits nothing and subtracts once.

ARMS
  (a) EVERY DATASET PARSES AND CITES -- or is in the MEASURED legacy set
      (`debt_registry.EVIDENCE_LEGACY_DATASETS`, 21 of 40 on 2026-10-20, each
      pinned with exactly what it lacks; a pin that grows, shrinks or names a
      file that is gone FAILS).  Each `tutorials/**/constant/experiments/
      *.dat` and `data/standards/evidence/*.dat` (when that folder exists)
      declares a subject (`system ( a b )` or `component x;`), a `columns ( )`
      list and a `data ( )` grid whose length is a multiple of the column
      count (the engine's own check), and a `provenance {}` block carrying
      `citation` and `sha256`.  A dataset nobody can cite is a number nobody
      can defend; a dataset with no sha256 cannot be told from a corrected
      transcription of itself, which is what a dossier cites it by.
  (b) NO `role` INSIDE A DATASET.  Fit / held-out is a property of the
      OPERATION that consumes the file (`evidence ( { dataset; role } )`),
      never of the file: a dataset declaring its own role would decide the
      partition the fingerprint is supposed to freeze.  Checked at the top
      level of the file (a `role` word inside a comment or a string is not a
      declaration).
  (c) THE PRIVATE TIER'S HOME IS DECLARED AND IGNORED.  `data/local/evidence/
      README.md` is TRACKED and every `.dat` beside it is gitignored, so a
      student's private data can never reach the public tree by accident
      (`git check-ignore`).
  (d) THE ENGINE EVALUATES AT DECLARED POINTS.  The witness
      `tutorials/props/compare/evidence01_methanol_water_points` asks three
      `propertyScan1D` ops for T_bubble AT the 13 measured x of its dataset
      (`vary { points ( ... ) }`).  Each op's CSV must carry EXACTLY those 13
      values in that order (the first column equals the dataset's x column
      to 1e-12), the run must ANNOUNCE the form (`[scan] evaluating at 13
      DECLARED point(s)`), and the result JSON's `n_points` must be 13 -- so
      a residual the GUI shows is engine-minus-measurement at the measured
      x, never a grid interpolation.
  (e) THE TWO FORMS REFUSE BY NAME, on probes this gate BUILDS from the
      witness (a guard whose only case satisfies it is a guard nothing
      tests): `points ( ... )` beside `n 51;` refuses naming BOTH forms; a
      scalar `points 25;` refuses naming the LIST grammar; an empty
      `points ( );` refuses.  Each probe must exit non-zero AND print the
      named sentence -- any failure would be checking that something went
      wrong, not that the right thing did.

WHAT THIS GATE DOES NOT COVER, so its OK line cannot imply it:
  * it does not compare any dataset against its article (the articles are
    not in the tree); `citation` present is the claim, not its truth;
  * it does not recompute a sha256 over the data block -- the engine's own
    reader does not either today; what is checked is that the field exists;
  * the GUI's reading of the same files is held by gui/tests/evidence.test.ts
    (the tutorial tier) and is not re-run here;
  * `data/local/evidence/*.dat` are never read: private, possibly absent.

SABOTAGE-VERIFIED 2026-10-20, four times by hand, each restored (the two
engine ones with a rebuild); the quoted lines are the gate's OBSERVED output:
  S1 -- `sha256` deleted from the witness's dataset (an unpinned file):
        `...methanol-water-bubble-je200341c.dat: provenance carries no sha256`
  S2 -- `role fit;` written at the top level of the same dataset:
        `...: declares `role` -- a dataset's role belongs to the operation
        that consumes it (evidence ( { dataset; role } )), never to the file`
  S3 -- the engine's grid-beside-list refusal disabled (`if (false && ...)`):
        `probe 'bothForms': the run did not refuse (exit 0)`
  S4 -- the `[scan] evaluating at N DECLARED point(s)` line silenced:
        `witness: no `[scan] evaluating at 13 DECLARED point(s)` announcement`
  The ratchet over EVIDENCE_LEGACY_DATASETS was exercised by its own first
  run: before the pin existed the gate listed exactly those 21 files.
"""
import re
import subprocess
import sys
import tempfile
import shutil
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from debt_registry import EVIDENCE_LEGACY_DATASETS  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "choupoProps"
WITNESS = ROOT / "tutorials/props/compare/evidence01_methanol_water_points"
WITNESS_SET = WITNESS / "constant/experiments/methanol-water-bubble-je200341c.dat"
LOCAL_README = ROOT / "data/local/evidence/README.md"

fails = []


def strip_comments(t: str) -> str:
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    t = re.sub(r"//[^\n]*", "", t)
    t = re.sub(r'"(?:[^"\\]|\\.)*"', '""', t)
    return t


def top_level_keys(t: str):
    """Words that open a top-level entry (depth 0 of braces/parens)."""
    depth = 0
    keys = set()
    at_start = True
    i = 0
    while i < len(t):
        c = t[i]
        if c in "{(":
            depth += 1
            at_start = False
        elif c in "})":
            depth -= 1
            at_start = False
        elif c == ";" or c == "\n":
            at_start = True
        elif depth == 0 and at_start and not c.isspace():
            m = re.match(r"[A-Za-z_][\w\[\].-]*", t[i:])
            if m:
                keys.add(m.group(0))
                i += len(m.group(0))
                at_start = False
                continue
            at_start = False
        i += 1
    return keys


def dataset_findings(path: Path):
    """The KINDS of finding for one dataset, each a short word, sorted:
    `subject`, `grid`, `provenance`, `citation`, `sha256`, `role`."""
    raw = path.read_text(encoding="utf-8", errors="replace")
    t = strip_comments(raw)
    keys = top_level_keys(t)
    found = set()
    if "system" not in keys and "component" not in keys:
        found.add("subject")
    if "columns" not in keys or "data" not in keys:
        found.add("grid")
    else:
        ncols = len(re.findall(r"\{\s*name\s+\S+?;\s*unit\s+\S+?;\s*\}", t))
        grid = re.search(r"^\s*data\s*\((.*?)\)\s*;", t, re.S | re.M)
        nums = grid.group(1).split() if grid else []
        if ncols < 2 or not nums or len(nums) % ncols != 0:
            found.add("grid")
    prov = re.search(r"^\s*provenance\s*\{(.*?)^\s*\}", t, re.S | re.M)
    if not prov:
        found.add("provenance")
    else:
        if not re.search(r"^\s*citation\s", prov.group(1), re.M):
            found.add("citation")
        if not re.search(r"^\s*sha256\s", prov.group(1), re.M):
            found.add("sha256")
    if "role" in keys:
        found.add("role")
    return sorted(found)


WORDS = {
    "subject": "declares neither `system ( a b )` nor `component x;`",
    "grid": "no `columns ( { name; unit; } ... )` + `data ( )` grid the engine can read",
    "provenance": "no `provenance {}` block",
    "citation": "provenance carries no citation",
    "sha256": "provenance carries no sha256",
    "role": "declares `role` -- a dataset's role belongs to the operation that"
            " consumes it (evidence ( { dataset; role } )), never to the file",
}


def check_datasets(files):
    """Arms (a)/(b) with the RATCHET over the measured legacy set."""
    pinned = dict(EVIDENCE_LEGACY_DATASETS)
    seen = set()
    for f in files:
        rel = str(f.relative_to(ROOT))
        got = dataset_findings(f)
        if "role" in got:
            fails.append(f"{rel}: {WORDS['role']}")   # never excusable
        if rel in pinned:
            seen.add(rel)
            want = sorted(pinned[rel].split(","))
            if got == want:
                continue
            if set(got) < set(want):
                fails.append(f"{rel}: now lacks only [{','.join(got) or 'nothing'}] where the"
                             f" pin says [{','.join(want)}] -- the debt shrank; update"
                             f" EVIDENCE_LEGACY_DATASETS (or remove the entry)")
            else:
                fails.append(f"{rel}: lacks [{','.join(got)}], more than its pin"
                             f" [{','.join(want)}] -- a pinned debt may not grow")
            continue
        for k in got:
            if k != "role":
                fails.append(f"{rel}: {WORDS[k]}")
    for rel in sorted(set(pinned) - seen):
        fails.append(f"debt_registry.EVIDENCE_LEGACY_DATASETS pins {rel}, which no"
                     " longer exists -- remove the pin")
    return len(pinned)


def run(case_dir: Path):
    p = subprocess.run([str(BIN)], cwd=str(case_dir), capture_output=True,
                       text=True, timeout=600)
    out = p.stdout + p.stderr
    js = None
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>", out, re.S)
    if m:
        try:
            js = json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    return p.returncode, out, js


def dataset_x(path: Path):
    t = strip_comments(path.read_text())
    cols = re.findall(r"\{\s*name\s+(\S+?);\s*unit\s+\S+?;\s*\}", t)
    grid = re.search(r"^\s*data\s*\((.*?)\)\s*;", t, re.S | re.M)
    nums = [float(v) for v in grid.group(1).split()]
    nc = len(cols)
    xi = next(i for i, c in enumerate(cols) if c.startswith("x["))
    return [nums[r * nc + xi] for r in range(len(nums) // nc)]


def csv_first_column(path: Path):
    lines = [ln for ln in path.read_text().splitlines() if ln.strip()]
    return [float(ln.split(",")[0]) for ln in lines[1:]]


def probe(name: str, edit, must_say: str):
    with tempfile.TemporaryDirectory() as td:
        case = Path(td) / "probe"
        shutil.copytree(WITNESS, case)
        pd = case / "system/propsDict"
        text = pd.read_text()
        i = text.index("\noperations")      # never the header comment, which quotes the grammar
        pd.write_text(text[:i] + edit(text[i:]))
        rc, out, _ = run(case)
        if rc == 0:
            fails.append(f"probe '{name}': the run did not refuse (exit 0)")
        elif must_say not in out:
            tail = [ln for ln in out.splitlines() if ln.strip()][-3:]
            fails.append(f"probe '{name}': refused, but not by name -- expected"
                         f" `{must_say}`; got: {' | '.join(tail)}")


def main():
    # ---- (a), (b): every dataset in the tree --------------------------------
    files = sorted(ROOT.glob("tutorials/**/constant/experiments/*.dat"))
    files = [f for f in files if "/props/old/" not in str(f)]
    std = ROOT / "data/standards/evidence"
    if std.is_dir():
        files += sorted(std.glob("*.dat"))
    if not files:
        fails.append("no dataset found under tutorials/**/constant/experiments -- the glob is wrong")
    nPinned = check_datasets(files)

    # ---- (c): the private tier's home -------------------------------------
    if not LOCAL_README.exists():
        fails.append("data/local/evidence/README.md is missing")
    else:
        tracked = subprocess.run(["git", "ls-files", "--error-unmatch", str(LOCAL_README)],
                                 cwd=str(ROOT), capture_output=True, text=True)
        if tracked.returncode != 0:
            fails.append("data/local/evidence/README.md is not tracked by git")
        ign = subprocess.run(["git", "check-ignore", "-q", "data/local/evidence/private.dat"],
                             cwd=str(ROOT))
        if ign.returncode != 0:
            fails.append("data/local/evidence/*.dat is NOT gitignored -- private data could reach the tree")

    # ---- (d): the engine at declared points --------------------------------
    if not BIN.exists():
        fails.append(f"{BIN} is missing; run `make all`")
    elif not WITNESS.is_dir():
        fails.append(f"witness {WITNESS.relative_to(ROOT)} is missing")
    else:
        with tempfile.TemporaryDirectory() as td:
            case = Path(td) / "witness"
            shutil.copytree(WITNESS, case)
            rc, out, js = run(case)
            if rc != 0:
                fails.append(f"witness: choupoProps exited {rc}")
            if not re.search(r"\[scan\] evaluating at 13 DECLARED point\(s\) of x\[methanol\]", out):
                fails.append("witness: no `[scan] evaluating at 13 DECLARED point(s)` announcement")
            xs = dataset_x(case / "constant/experiments/methanol-water-bubble-je200341c.dat")
            for op in ("txy_nrtl_points", "txy_unifac_points", "txy_ideal_points"):
                csv = case / f"{op}.csv"
                if not csv.exists():
                    fails.append(f"witness: {op}.csv was not written")
                    continue
                got = csv_first_column(csv)
                if len(got) != len(xs):
                    fails.append(f"witness: {op}.csv has {len(got)} rows, the dataset {len(xs)} points")
                    continue
                for r, (a, b) in enumerate(zip(got, xs)):
                    if abs(a - b) > 1e-12:
                        fails.append(f"witness: {op}.csv column 1 != the dataset's x at row {r}"
                                     f" ({a} vs {b}) -- not evaluated AT the measured point")
                        break
            if js is not None:
                ops = {o.get("name"): o for o in js.get("operationResults", [])}
                for op in ("txy_nrtl_points", "txy_unifac_points", "txy_ideal_points"):
                    d = (ops.get(op) or {}).get("diagnostics", {})
                    if d.get("n_points") != 13:
                        fails.append(f"witness: result JSON n_points for {op} is {d.get('n_points')}, expected 13")
            else:
                fails.append("witness: no result JSON between the markers")

        # ---- (e): the refusals, on built probes -----------------------------
        probe("bothForms",
              lambda s: s.replace("vary        { variable x[methanol];",
                                  "vary        { variable x[methanol]; n 51; from 0; to 1;", 1),
              "declares BOTH a `points ( ... )` list and a grid")
        probe("scalarPoints",
              lambda s: re.sub(r"points \([^)]*\);", "points 25;", s, count=1),
              "must be a LIST of values")
        probe("emptyPoints",
              lambda s: re.sub(r"points \([^)]*\);", "points ( );", s, count=1),
              "is an empty list")

    if fails:
        print("check_evidence_records: FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    print(f"check_evidence_records: OK -- {len(files) - nPinned} of {len(files)} dataset(s)"
          f" under constant/experiments parse, name their subject, cite and carry a sha256;"
          f" the other {nPinned} are the MEASURED legacy set pinned in debt_registry"
          f".EVIDENCE_LEGACY_DATASETS, each lacking exactly what its pin says (a pin that"
          f" grows or shrinks fails); none declares a `role`;"
          f" data/local/evidence README tracked and .dat ignored;"
          f" the witness evaluates at its 13 declared points (3 ops, CSV = dataset x to 1e-12,"
          f" announced, n_points 13); 3 probes refuse by name.  NOT checked: any value"
          f" against its article; the sha256 against the data block.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
