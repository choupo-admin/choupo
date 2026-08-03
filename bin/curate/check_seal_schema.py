#!/usr/bin/env python3
"""computationalSeal gate (sealing-schema migration, ratified 2026-08-03).

The claim under test: under `sealSchema computational;` the seal is about
the PARSED content -- excluded material is excluded by TYPED FIELDS (the
parser's tree), never by comment-stripping -- while a moved value,
dimension or structure diverges exactly as the legacy byte seal did.

Probes:

  CANON      the engine's canonicalization (choupoProps --canonical-hash)
             maps comment / whitespace / unit-spelling variants of the
             same content to ONE hash (`1 bar` == `1e5 Pa`), and a moved
             VALUE to a different one.  Conservative corollary pinned:
             dropping the unit spelling entirely (raw SI, no declared
             dimensions) is NOT claimed cosmetic -- the dimension-checked
             lookup surface moved.
  COSMETIC   on a migrated sealed case, a comment appended to a claimed
             record keeps verdict `verified` and announces the byte-only
             drift by name.
  VALUE      a moved number on the same record turns the verdict
             `diverged` naming the record.
  REFUSE     with `onDivergence refuse;` the value edit stops the run
             (nonzero exit, the ARCHIVAL wording); the cosmetic edit
             alone does NOT stop it (the declared claim still holds).
  MIGRATE    bin/curate/migrate_seal_schema.py is idempotent (second run
             reports 'already computational', bytes untouched) and
             FAIL-CLOSED (a case whose record bytes diverged from the
             legacy claim is SKIPPED with exit 1, never silently
             re-claimed -- the no-scientific-reseal mandate).

Exit 1 listing failures."""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
MIGRATE = ROOT / "bin" / "curate" / "migrate_seal_schema.py"
CASE = ROOT / "tutorials" / "steady" / "thermoTest" / "model5_nrtl_flash"

failures = []


def chash(path: Path) -> str:
    r = subprocess.run([str(PROPS), "--canonical-hash", str(path)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        failures.append("canonical-hash failed on %s: %s"
                        % (path, r.stderr.strip()))
        return ""
    return r.stdout.split()[0]


def run_case(case: Path):
    p = subprocess.run([str(SOLVE), "."], cwd=case,
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def main() -> int:
    for exe in (PROPS, SOLVE):
        if not exe.exists():
            print("check_seal_schema: %s missing -- build first" % exe)
            return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- CANON ------------------------------------------------------
        a = tmp / "a.dat"
        b = tmp / "b.dat"
        c = tmp / "c.dat"
        d = tmp / "d.dat"
        a.write_text("/* hdr */\nfoo   1 bar;  // note\nlist ( 1 2 3 );\n"
                     "sub { x 2; }\n")
        b.write_text("foo 1e5 Pa;\nlist (1 2 3);\nsub{x 2;}\n")
        c.write_text("foo 1.0001 bar;\nlist (1 2 3);\nsub{x 2;}\n")
        d.write_text("foo 100000;\nlist (1 2 3);\nsub{x 2;}\n")
        ha, hb, hc, hd = chash(a), chash(b), chash(c), chash(d)
        if ha and ha != hb:
            failures.append("CANON: comment/spacing/unit-spelling variants"
                            " hash differently (%s vs %s)" % (ha, hb))
        if ha and ha == hc:
            failures.append("CANON: a moved value did not move the hash")
        if ha and ha == hd:
            failures.append("CANON: dropping the declared unit was claimed"
                            " cosmetic -- the conservative dims rule is gone")

        # ---- sealed-case probes ----------------------------------------
        case = tmp / CASE.name
        shutil.copytree(CASE, case, ignore=shutil.ignore_patterns(
            "expected", "log.*", "reports", "converged", "resultJson*"))
        mf = case / "constant" / "propertyManifest"
        if "sealSchema         computational;" not in mf.read_text():
            failures.append("witness manifest is not computational-schema"
                            " (migration not applied?)")
        rec = case / "constant" / "components" / "ethanol.dat"

        rc, out = run_case(case)
        if rc != 0 or '"verdict": "verified"' not in out:
            failures.append("baseline: expected verified run, rc=%d" % rc)

        # COSMETIC
        rec.write_text(rec.read_text() + "\n// gate cosmetic probe\n")
        rc, out = run_case(case)
        if rc != 0 or '"verdict": "verified"' not in out:
            failures.append("COSMETIC: comment edit broke the verdict")
        if "BYTES ONLY" not in out \
           or "cosmetic  constant/components/ethanol.dat" not in out:
            failures.append("COSMETIC: byte-only drift not announced by name")

        # REFUSE must NOT fire on cosmetic drift
        mftext = mf.read_text()
        mf.write_text(mftext.replace("    sealed             true;",
                                     "    sealed             true;\n"
                                     "    onDivergence       refuse;"))
        rc, out = run_case(case)
        if rc != 0:
            failures.append("REFUSE: cosmetic drift stopped an archival run"
                            " -- the declared claim (parsed content) holds")
        # VALUE edit under refuse -> stop
        rec.write_text(rec.read_text().replace("MW          46.069;",
                                               "MW          46.070;"))
        rc, out = run_case(case)
        if rc == 0 or "ARCHIVAL" not in out:
            failures.append("REFUSE: a moved value did not stop the"
                            " archival run (rc=%d)" % rc)
        # VALUE edit under announce -> diverged, named
        mf.write_text(mftext)
        rc, out = run_case(case)
        if '"verdict": "diverged"' not in out \
           or "components/ethanol.dat" not in out:
            failures.append("VALUE: moved number did not diverge by name")

        # ---- MIGRATE: idempotence + fail-closed ------------------------
        case2 = tmp / ("m_" + CASE.name)
        shutil.copytree(CASE, case2, ignore=shutil.ignore_patterns(
            "expected", "log.*", "reports", "converged", "resultJson*"))
        r = subprocess.run([sys.executable, str(MIGRATE), str(case2)],
                           capture_output=True, text=True)
        if r.returncode != 0 or "1 already computational" not in r.stdout:
            failures.append("MIGRATE: idempotence broken on a migrated"
                            " case:\n" + r.stdout)
        # fail-closed: legacy-schema manifest whose record bytes moved
        mf2 = case2 / "constant" / "propertyManifest"
        t = mf2.read_text()
        t = t.replace("    sealSchema         computational;\n", "")
        t = re.sub(r'\n\s*computationalSha256 "[0-9a-f]{64}";', "", t)
        mf2.write_text(t)
        rec2 = case2 / "constant" / "components" / "ethanol.dat"
        rec2.write_text(rec2.read_text().replace("MW          46.069;",
                                                 "MW          46.070;"))
        r = subprocess.run([sys.executable, str(MIGRATE), str(case2)],
                           capture_output=True, text=True)
        if r.returncode == 0 or "SKIPPED" not in r.stdout \
           or "bytes diverged" not in r.stdout:
            failures.append("MIGRATE: a byte-diverged case was not"
                            " fail-closed SKIPPED:\n" + r.stdout)

    if failures:
        print("check_seal_schema: FAIL")
        for m in failures:
            print("  -", m)
        return 1
    print("check_seal_schema: OK -- canonicalization equivalences hold"
          " (unit spellings yes, dropped dims no), cosmetic drift stays"
          " verified + announced, moved values diverge/refuse by name,"
          " migration idempotent + fail-closed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
