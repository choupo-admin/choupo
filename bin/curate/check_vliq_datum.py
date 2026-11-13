#!/usr/bin/env python3
"""Gate: every component's liquid-volume datum says the temperature it belongs to.

    bin/curate/check_vliq_datum.py

THE RULE (DEV.md 4c C378, review row TR-12;
docs/design/liquid-volume-datum-temperature.md).  A record's `Vliq` is the
liquid molar volume at `VliqT` (kelvin; absent = 298.15 K).  Twenty records
stored a volume at their normal boiling point (or at 273 K, or at 465 K) that
the engine read as a 25 C volume: CO2's liquid came out 32 % too dense at
25 C and liquid N2 and CH4 were refused.  `VliqT` now carries the
temperature; this gate keeps the record and the key from disagreeing again.

WHAT IT CHECKS, over data/standards/components/*.dat:
  (a) a record whose `Vliq` comment STATES a temperature ("at Tb", "at 273 K",
      "@298K", "rho(465)") carries a `VliqT` that agrees with it within
      0.5 K (the default 298.15 K when it carries none);
  (b) a record with Tc below 330 K that carries `Vliq` carries `VliqT` too,
      or states 25 C / 298 K in its comment, or is pinned by name in
      bin/curate/vliq_datum_debt.tsv -- below 330 K a stored liquid volume
      is far more likely to belong to the boiling point than to 25 C, which
      is where the twenty came from;
  (c) `VliqT` without `Vliq`, and `VliqT` at or above `Tc`, are refused
      (the engine refuses both at load; the gate says so before a run);
  (d) the debt list is TWO-SIDED: every pinned record exists, carries
      `Vliq`, and does NOT carry `VliqT` -- a record that gained one is
      paid, and its pin must be removed in the same commit.
  (e) every `VliqT` line is a temperature in kelvin -- a bare number or
      one followed by `K` -- so a line this gate cannot read is a finding,
      never a record treated as having no key (review VT-01);
  (f) the engine refuses a `VliqT` of the wrong dimension: a scratch copy
      of tutorials/steady/flash/flash09_n2ch4_stryjek whose CH4 record
      carries `VliqT 50 Pa;` is run with <root>/choupoSolve and must exit
      non-zero naming `VliqT` (review VT-01: it used to be read as 50 K in
      silence).  A missing binary REFUSES: an arm that cannot run does not
      pass.

WHAT IT DOES NOT CHECK.  Whether a stated temperature is the RIGHT one (the
evidence batch data/curation/batches/vliq_datum_temperature/ is that
reading); case-local sealed copies (they are frozen by their seal and
drift is reported by check_seal_drift); a temperature written only in
prose away from the `Vliq` line.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMP = ROOT / "data" / "standards" / "components"
DEBT = ROOT / "bin" / "curate" / "vliq_datum_debt.tsv"
NAME = "check_vliq_datum"
TOL = 0.5          # K
TC_SCREEN = 330.0  # K

SCALAR = r"^{key}\s+([-+0-9.eE]+)(?:\s+K)?\s*;"
LINE = re.compile(r"^Vliq\s+[-+0-9.eE]+\s*;(.*)$", re.M)


def scalar(text, key):
    m = re.search(SCALAR.format(key=key), text, re.M)
    return float(m.group(1)) if m else None


def stated_temperature(comment, Tb):
    """The temperature the Vliq comment states, or None."""
    c = comment
    if re.search(r"\bat\s+Tb\b", c):
        return Tb
    m = re.search(r"(?:\bat\s+|@\s*|rho\(|ρ\()\s*([0-9]+(?:\.[0-9]+)?)\s*(K\b|\))", c)
    if m:
        return float(m.group(1))
    if re.search(r"\b(25\s*(C|°C|degC))\b", c):
        return 298.15
    return None


VLIQT_LINE = re.compile(r"^VliqT\b(.*)$", re.M)
VLIQT_FORM = re.compile(r"^\s+[-+0-9.eE]+(\s+K)?\s*;")
PROBE_CASE = ROOT / "tutorials" / "steady" / "flash" / "flash09_n2ch4_stryjek"


def probe_wrong_dimension():
    """Arm (f): `VliqT 50 Pa;` must be refused by the engine.  Returns a finding or None."""
    exe = ROOT / "choupoSolve"
    if not exe.exists():
        return f"arm (f) cannot run: {exe} does not exist (build the tree)"
    with tempfile.TemporaryDirectory(prefix="vliqdatum_") as tmp:
        case = Path(tmp) / "case"
        shutil.copytree(PROBE_CASE, case)
        rec = case / "constant" / "components" / "CH4.dat"
        if not rec.exists():
            return f"arm (f) cannot run: {rec.relative_to(case)} is not in the probe case"
        t = rec.read_text(encoding="utf-8")
        m = re.search(r"^Vliq\s[^\n]*\n", t, re.M)
        if not m:
            return "arm (f) cannot run: the probe record carries no `Vliq`"
        t = re.sub(r"^VliqT\b[^\n]*\n", "", t, flags=re.M)
        m = re.search(r"^Vliq\s[^\n]*\n", t, re.M)
        rec.write_text(t[:m.end()] + "VliqT 50 Pa;\n" + t[m.end():], encoding="utf-8")
        env = {"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin", "LC_ALL": "C"}
        p = subprocess.run([str(exe), "."], cwd=case, env=env, capture_output=True,
                           text=True, timeout=300)
        out = p.stdout + p.stderr
        if p.returncode == 0 or "VliqT" not in out:
            return ("arm (f): `VliqT 50 Pa;` was NOT refused by the engine (exit "
                    f"{p.returncode}) -- a pressure read as a temperature in silence")
    return None


def main():
    debt = {}
    for ln in DEBT.read_text(encoding="utf-8").splitlines():
        if not ln.strip() or ln.startswith("#"):
            continue
        name, why = (ln.split("\t") + [""])[:2]
        debt[name.strip()] = why.strip()

    fails = []
    n_vliq = n_vliqT = n_stated = 0
    seen = set()
    for p in sorted(COMP.glob("*.dat")):
        name = p.stem
        t = p.read_text(encoding="utf-8", errors="replace")
        V = scalar(t, "Vliq")
        VT = scalar(t, "VliqT")
        Tc = scalar(t, "Tc")
        Tb = scalar(t, "Tb")
        for lm in VLIQT_LINE.finditer(t):
            if not VLIQT_FORM.match(lm.group(1)):
                fails.append(f"{name}: `VliqT{lm.group(1).split('//')[0].rstrip()}` is not a "
                             "temperature in kelvin (a bare number, or one followed by `K`)")
        if VT is None and VLIQT_LINE.search(t):
            VT = float("nan")
        if VT is not None:
            n_vliqT += 1
            if V is None or V <= 0:
                fails.append(f"{name}: `VliqT` without `Vliq` -- a temperature of nothing")
            if Tc and Tc > 0 and VT >= Tc:
                fails.append(f"{name}: `VliqT` {VT} K is at or above Tc {Tc} K -- no saturated liquid there")
        if V is None or V <= 0:
            if name in debt:
                fails.append(f"{name}: pinned in {DEBT.name} but carries no `Vliq`")
            continue
        n_vliq += 1
        m = LINE.search(t)
        comment = m.group(1) if m else ""
        Ts = stated_temperature(comment, Tb)
        Teff = VT if VT is not None else 298.15
        if Ts is not None:
            n_stated += 1
            if abs(Ts - Teff) > TOL:
                fails.append(f"{name}: the `Vliq` comment states {Ts:g} K "
                             f"('{comment.strip()}') but the record reads it at "
                             f"{Teff:g} K ({'VliqT' if VT is not None else 'no VliqT: 298.15 K'})"
                             " -- write the stated temperature as `VliqT`")
        if name in debt:
            seen.add(name)
            if VT is not None:
                fails.append(f"{name}: now carries `VliqT` {VT:g} K -- its pin in "
                             f"{DEBT.name} is paid; remove the line in the same commit")
            continue
        if Tc and 0 < Tc < TC_SCREEN and VT is None and not (Ts is not None and abs(Ts - 298.15) <= TOL):
            fails.append(f"{name}: Tc = {Tc:g} K < {TC_SCREEN:g} K, `Vliq` without `VliqT` and "
                         "no stated 25 C -- below 330 K a stored liquid volume usually belongs "
                         "to the boiling point.  State its temperature as `VliqT` (from the "
                         "source), or pin the record by name with the reason")
    for name in sorted(set(debt) - seen):
        if not (COMP / f"{name}.dat").exists():
            fails.append(f"{name}: pinned in {DEBT.name} but there is no record of that name")

    probe = probe_wrong_dimension()
    if probe:
        fails.append(probe)

    if fails:
        print(f"{NAME}: FAIL -- {len(fails)} finding(s):")
        for f in fails:
            print("  " + f)
        return 1
    print(f"{NAME}: OK -- {n_vliq} records carry `Vliq`, {n_vliqT} state its temperature as "
          f"`VliqT`, {n_stated} state one in the `Vliq` comment and agree with the key; "
          f"{len(debt)} unresolved pinned by name ({', '.join(sorted(debt))}); the engine refuses "
          "`VliqT 50 Pa;` (run on a scratch copy).  NOT CHECKED: "
          "whether a stated temperature is right, case-local sealed copies, prose away from "
          "the `Vliq` line.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
