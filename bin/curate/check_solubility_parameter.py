#!/usr/bin/env python3
"""The Hildebrand parameter is DERIVED, and the derivation is checked.

WHAT THIS GUARDS.  `delta = sqrt((dHvap(T) - R T)/V_m)` has three ways to go
quietly wrong, and not one of them raises:

  * the RT term dropped -- delta a few per cent high, which looks fine;
  * V_m in the wrong unit -- delta off by a round factor, which also looks
    fine, because a solubility parameter has no intuitive magnitude;
  * Pa^0.5 reported where the literature uses MPa^0.5 -- a factor of 31.6,
    and the number still reads as a solubility parameter.

What catches all three is the same device as the Zc column in a property data
bank: an INDEPENDENT determination beside the derived one.  63 catalogue
records carry a published delta as an ANCHOR (never an input), and the op
prints the deviation.

THE ARMS

  (a) THE WITNESS DERIVES, AND AGREES.  All seven substances of
      solubility01 must be priced, each within 1.5 % of the published value.
      The band is not a tolerance the code may drift inside: the observed
      worst is 0.85 %, and 1.5 % leaves room for a component record being
      re-curated without leaving room for a unit slip.

  (b) THE ANCHOR IS AN ANCHOR.  Deleting the published value must change no
      derived delta -- if it does, the "check" is feeding the thing it
      checks, which is the failure this whole shape exists to prevent.

  (c) THE THREE REFUSALS FIRE BY NAME, on probe cases BUILT here: a component
      with no Vliq, one with no HvapTb, and a temperature above Tc.  The
      shipped witness satisfies all three guards, so a guard tested only
      against it is a guard nothing tests.

  (d) THE LIMIT IS ALWAYS STATED.  Hildebrand carries no hydrogen bonding,
      and the run must say so on EVERY call -- not only when a pair looks
      close.  A single-parameter theory that is right most of the time is
      exactly the kind that gets trusted where it is wrong.

WHAT THIS DOES NOT COVER, said so the OK line cannot imply it: agreement with
a published delta is agreement with ONE compilation, computed from inputs that
may share our own lineage -- it establishes that the arithmetic is right, not
that the substance behaves as the number suggests.  Nothing here tests a
MISCIBILITY prediction against experiment; the corpus holds no such data.
And Hansen is not implemented at all.

SABOTAGE-VERIFIED 2026-08-26.  Quoted lines are observed.
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/props/molecular/solubility01_hildebrand_ladder"
BIN = ROOT / "choupoProps"
BAND = 0.015

fails = []


def run(case_dir):
    p = subprocess.run([str(BIN)], cwd=str(case_dir), capture_output=True,
                       text=True, timeout=600)
    out = p.stdout + p.stderr
    js = None
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if m:
        try:
            js = json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    return out, js


def diags(js):
    for op in (js or {}).get("operationResults", []):
        d = op.get("diagnostics")
        if d and any(k.startswith("delta_") for k in d):
            return d
    return {}


def main():
    if not BIN.exists():
        print(f"check_solubility_parameter: FAIL -- {BIN} missing; run `make all`")
        return 1

    out, js = run(CASE)
    d = diags(js)

    # ---- (a) every substance priced, and agreeing -------------------------
    deltas = {k[6:]: v for k, v in d.items() if k.startswith("delta_")}
    devs = {k[4:]: v for k, v in d.items() if k.startswith("dev_")
            and k != "dev_worst"}
    if len(deltas) != 7:
        fails.append(f"solubility01: {len(deltas)} substance(s) priced,"
                     " expected 7 -- the witness no longer exercises the ladder")
    if len(devs) != len(deltas):
        fails.append(f"solubility01: {len(devs)} of {len(deltas)} carry a"
                     " published anchor -- the derivation is partly unchecked")
    for name, v in sorted(devs.items()):
        if v > BAND:
            fails.append(f"solubility01: {name} derives a delta {v*100:.2f} %"
                         f" from its published value (band {BAND*100:.1f} %)"
                         " -- a unit slip or a dropped RT term looks exactly"
                         " like this")

    # ---- (b) the anchor must not feed the derivation ----------------------
    probe = ROOT / "generated/probes/solubility"
    shutil.rmtree(probe, ignore_errors=True)
    noAnchor = probe / "noAnchor"
    shutil.copytree(CASE, noAnchor, ignore=shutil.ignore_patterns(
        "*.csv", "log.*", "expected"))
    #  Strip the anchors by overlaying case-local component records that
    #  carry every field EXCEPT the published delta.
    (noAnchor / "constant/components").mkdir(parents=True, exist_ok=True)
    for name in deltas:
        src = ROOT / f"data/standards/components/{name}.dat"
        if not src.exists():
            continue
        #  0 is how the engine reads "no published value" -- deleting the
        #  line would leave the catalogue's own still in force (the overlay
        #  is field by field).
        txt = re.sub(r"^solubilityParameter\s+[^;]*;",
                     "solubilityParameter 0.0;", src.read_text(),
                     count=1, flags=re.M)
        (noAnchor / f"constant/components/{name}.dat").write_text(txt)
    _, js2 = run(noAnchor)
    d2 = diags(js2)
    moved = [n for n, v in deltas.items()
             if abs(d2.get("delta_" + n, v) - v) > 1e-9 * max(abs(v), 1.0)]
    if moved:
        fails.append("removing the PUBLISHED delta moved the DERIVED one for "
                     + ", ".join(sorted(moved))
                     + " -- the anchor is feeding the derivation it checks")
    if any(k.startswith("dev_") for k in d2):
        fails.append("with no anchor present the run still reports a deviation"
                     " -- it is comparing against something undeclared")
    shutil.rmtree(probe, ignore_errors=True)

    # ---- (c) the refusals, on probes BUILT here ---------------------------
    for label, mutate, expect in PROBES:
        p = ROOT / "generated/probes/solubility" / label
        shutil.rmtree(p, ignore_errors=True)
        shutil.copytree(CASE, p, ignore=shutil.ignore_patterns(
            "*.csv", "log.*", "expected"))
        mutate(p)
        pout, _ = run(p)
        if expect not in pout:
            last = (pout.strip().splitlines() or ["(no output)"])[-1][:170]
            fails.append(f"probe '{label}': no refusal naming"
                         f" `{expect[:60]}...` -- got: {last}")
    shutil.rmtree(ROOT / "generated/probes/solubility", ignore_errors=True)

    # ---- (d) the limit is stated, always ----------------------------------
    if "carries no hydrogen bonding" not in out:
        fails.append("the run does not state that Hildebrand carries no"
                     " hydrogen bonding -- one number implying more than it"
                     " holds is this tool's whole failure mode")
    if "Hansen" not in out:
        fails.append("the run does not name Hansen as what the missing"
                     " capability is called")

    if fails:
        print("check_solubility_parameter: FAIL")
        for f in fails:
            print("  - " + f)
        return 1

    worst = max(devs.values()) if devs else 0.0
    print(f"check_solubility_parameter: OK -- solubility01 derives delta for"
          f" {len(deltas)} substance(s) from HvapTb, Tc and Vliq, and every one"
          f" reproduces an INDEPENDENTLY published value (worst"
          f" {worst*100:.2f} %, band {BAND*100:.1f} %); removing the published"
          f" value moves no derived delta, so the anchor cannot be feeding the"
          f" derivation; {len(PROBES)} built probe(s) refuse by name (no Vliq,"
          f" no HvapTb, T above Tc); and the run states on every call that"
          f" Hildebrand carries no hydrogen bonding and names Hansen as what"
          f" would.  NOT CHECKED: that any MISCIBILITY prediction matches"
          f" experiment -- the corpus holds no such data, and agreement with"
          f" one compilation establishes the arithmetic, not the chemistry.")
    return 0


# ---------------------------------------------------------------------------
def _drop_field(d, comp, field):
    """Make a component LACK a datum, case-locally.

    NOT by deleting the line.  `Database` overlays a case-local record over
    the standard entry FIELD BY FIELD, so a deleted line is simply supplied
    again by the catalogue -- the first version of these probes did exactly
    that and tested nothing, silently, while reporting a clean overlay
    message.  Writing the field as 0 is what the engine reads as absent
    (Component defaults every one of these to 0.0), so this states the
    absence instead of hoping for it."""
    src = ROOT / f"data/standards/components/{comp}.dat"
    (d / "constant/components").mkdir(parents=True, exist_ok=True)
    txt = re.sub(rf"^{field}\s+[^;]*;", f"{field}  0.0;",
                 src.read_text(), count=1, flags=re.M)
    (d / f"constant/components/{comp}.dat").write_text(txt)


def _probe_no_vliq(d):
    _drop_field(d, "benzene", "Vliq")


def _probe_no_hvap(d):
    _drop_field(d, "benzene", "HvapTb")


def _probe_above_tc(d):
    p = d / "system/propsDict"
    p.write_text(p.read_text().replace("298.15 K", "700 K"))


PROBES = [
    ("noVliq", _probe_no_vliq, "no liquid molar volume (Vliq)"),
    ("noHvapTb", _probe_no_hvap, "no latent heat at the normal boiling point"),
    ("aboveTc", _probe_above_tc, "at or above its critical temperature"),
]

if __name__ == "__main__":
    sys.exit(main())
