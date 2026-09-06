#!/usr/bin/env python3
"""VT-2005 scrub gate: the public tree ships NO externally-restricted values.

A COSMO set in the public repository is either an EXTERNAL REFERENCE
(`licence externalRestricted; installed false;` -- names and cites the
dataset, carries no numbers) or a set whose source declares open terms
(the synthetic teaching surrogates, GPL).  A sigmaProfile sitting under a
restricted licence anywhere in data/ or tutorials/ is redistribution and
fails this gate.  data/local is gitignored and out of scope: what the user
installs there is theirs.

TWO ARMS ADDED 2026-09-06 (record: docs/design/the-licence-of-a-sigma-profile.md).

  (v) A `variant "2002"` LABEL IS A CLAIM ABOUT ORIGIN.  CosmoSac.cpp reads
      exactly one thing before pairing a profile with the 2002 constants: the
      set's `variant` word.  The 2002 constants were fitted against VT-2005
      profiles (DMol3 DFT-COSMO); data/tmp/COSMO_VALIDATION_STUDY.md
      (2026-07-24) measured that an LVPP profile (NWChem, a different cavity)
      run under those constants flips the sign of G^E on water/acetone, at
      exit 0.  So a leaf set declaring `variant "2002"` REFUSES when its
      `source` names a FOREIGN database (LVPP, CHAOS, the UD folder), and
      REFUSES when it names neither the VT-2005 database nor a SYNTHETIC
      surrogate.  A set with another variant word is the engine's to refuse,
      not this gate's.
  (i) `installed true;` ON A VT2005 SET IN THE PUBLIC TREE REFUSES -- values
      follow an installed set, and the only lawful home for a VT-2005 value
      is data/local (academic non-commercial by BioVia permission, per
      usnistgov/COSMOSAC's own README; no grant on the original VT page).

WHAT THESE ARMS CANNOT SEE, said plainly: a `source` string that LIES -- LVPP
numbers under a sentence naming VT-2005 -- is beyond any text gate; only the
dataset's own file (bin/choupo-import-cosmo reads the VT2005-NNNN-PROF.txt
layout) or a human comparison can catch that.

SABOTAGES, by hand on temporary edits to the shipped files, each reverted
with `git checkout` before any suite run (2026-09-06; the observed refusal
lines, abridged).  THE FIRST DRAFT'S ARMS RAN ON NOTHING: the block regex is
non-overlapping, so the enclosing `cosmo {}` consumes every leaf and a leaf
never matches alone; the draft skipped bodies containing "{" and S3 came
back OK.  A negative that passes proves nothing until a sabotage fails.
  S1  cosmoSAC01 acetone.dat, `source` -> "LVPP sigma-profile database v25
      (github.com/lvpp/sigma), MIT": two refusals -- the older open-licence
      arm ("no open-licence declaration") AND
      "set 'VT2005' declares variant \"2002\" but its source names a FOREIGN
       database (LVPP) -- ... would run to a silently wrong gamma ..."
  S1b same, `source` -> "LVPP sigma-profile database v25 (...), CC-BY 4.0":
      the older arm is SATISFIED by CC-BY, so arm (v) is the ONLY refusal --
      this is the case that proves the arm load-bearing.
  S2  same, `source` -> "a profile of unknown origin":
      "... names neither the VT-2005 database nor a SYNTHETIC surrogate --
       a label the engine accepts is a claim about origin ..."
  S3  data/standards/components/ethanol.dat, `installed false;` -> `true;`:
      "set 'VT2005' declares `installed true;` in the public tree -- a
       VT-2005 set may be installed only under data/local ..."
  S4  (negative) the shipped tree: OK, 0 refusals; the five SYNTHETIC witness
      sets pass arm (v) on their declared SYNTHETIC word.


CARDS.  The sources this gate rules on are documented in
thirdParty/vt2005-cosmo/README.md (no data file, the three primary
licence texts quoted) and thirdParty/lvpp-sigma/README.md (MIT, and the
thermodynamic reason its profiles are not used); check_source_licence
verifies that both cards exist and are named here, by path.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def armLeaf(p, setName, leaf):
    """Arms (v) and (i) on ONE leaf set (`<setName> { ... }` under `cosmo {}`)."""
    body = leaf
    vm = re.search(r'variant\s+"([^"]*)"', body)
    sm = re.search(r'source\s+"([^"]*)"', body)
    src = sm.group(1) if sm else ""
    variant = vm.group(1) if vm else ""
    if variant == "2002":
        foreign = re.search(r'\bLVPP\b|lvpp/sigma|\bCHAOS\b|profiles/UD\b|\bUD\s+(?:folder|database)',
                            src)
        namesVT = re.search(r'VT-?2005', src)
        namesSynth = "SYNTHETIC" in src
        if foreign:
            bad.append(f"{p.relative_to(ROOT)}: set '{setName}' declares"
                       f" variant \"2002\" but its source names a FOREIGN"
                       f" database ({foreign.group(0)}) -- the 2002 constants"
                       f" were fitted to VT-2005 profiles and the engine's"
                       f" variant guard reads only this label, so the profile"
                       f" would run to a silently wrong gamma (the"
                       f" 2026-07-24 study); give it its own variant"
                       f" (reserved) or strip it")
        elif not (namesVT or namesSynth):
            bad.append(f"{p.relative_to(ROOT)}: set '{setName}' declares"
                       f" variant \"2002\" but its source names neither the"
                       f" VT-2005 database nor a SYNTHETIC surrogate --"
                       f" a label the engine accepts is a claim about origin;"
                       f" name the database the profile came from")
    isVT = ("VT2005" in setName or re.search(r'VT-?2005', src)) \
        and "SYNTHETIC" not in src
    if isVT and re.search(r'installed\s+true\b', body):
        bad.append(f"{p.relative_to(ROOT)}: set '{setName}' declares"
                   f" `installed true;` in the public tree -- a VT-2005"
                   f" set may be installed only under data/local (academic"
                   f" non-commercial by BioVia permission, per the"
                   f" usnistgov/COSMOSAC README); the public tree carries"
                   f" the reference alone (`installed false;`)")


bad = []
scanned = refs = synth = ndat = 0
for base in ("data/standards", "tutorials"):
    #  A SCAN OVER NOTHING IS NOT A SCRUBBED TREE (2026-08-15 fleet census).
    #  This gate shared the check_true_ions death shape: rename a scanned
    #  root and rglob returns nothing, zero restricted values are found over
    #  zero records, and the gate goes permanently green.  An absent root
    #  refuses by name; the collapsed-count floor sits before the verdict.
    if not (ROOT / base).is_dir():
        print(f"cosmo-scrub gate FAILED: scan root '{base}' does not exist --"
              f" this gate cannot see what it audits, and a green verdict"
              f" over an absent tree would be the check_true_ions failure"
              f" again.")
        sys.exit(1)
    for p in sorted((ROOT / base).rglob("*.dat")):
        if "data/local" in str(p):
            continue
        ndat += 1
        t = p.read_text(errors="replace")
        if "cosmo" not in t:
            continue
        scanned += 1
        for m in re.finditer(r'(\w+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}', t):
            body = m.group(2)
            if "sigmaProfile" not in body and "variant" not in body:
                continue
            restricted = "externalRestricted" in body or "REQUIRES REVIEW" in body
            hasProfile = "sigmaProfile" in body
            openSrc = re.search(r'source\s+"[^"]*(SYNTHETIC|GPL|public domain|CC-BY(?!-NC))[^"]*"', body)
            if hasProfile and restricted:
                bad.append(f"{p.relative_to(ROOT)}: set '{m.group(1)}' carries a"
                           f" sigmaProfile under a restricted licence --"
                           f" redistribution; strip it to an external reference")
            if hasProfile and not restricted and not openSrc:
                bad.append(f"{p.relative_to(ROOT)}: set '{m.group(1)}' carries a"
                           f" sigmaProfile with no open-licence declaration in"
                           f" its source -- declare the terms or strip it")
            if hasProfile and openSrc:
                synth += 1
            if not hasProfile and restricted:
                refs += 1
            #  Arms (v) and (i) read LEAF sets.  The block regex above is
            #  NON-OVERLAPPING, so the enclosing `cosmo {}` consumes every
            #  leaf inside it and a leaf never matches on its own -- the
            #  first draft skipped bodies containing "{" and therefore ran
            #  on nothing (S3 survived; caught by hand, 2026-09-06).  The
            #  leaves are re-extracted from the enclosing body instead.
            leaves = (re.findall(r'(\w+)\s*\{([^{}]*)\}', body)
                      if "{" in body else [(m.group(1), body)])
            for setName, leaf in leaves:
                armLeaf(p, setName, leaf)

#  Collapsed-scan floor (2026-08-15 fleet census): 3723 .dat records
#  enumerated; a count under 500 means the scan surface has collapsed, not
#  that the corpus shrank.  See check_true_ions.
if ndat < 500:
    print(f"cosmo-scrub gate FAILED: only {ndat} .dat record(s) enumerated --"
          f" the corpus holds thousands, so the scan surface has collapsed"
          f" and a verdict over it would describe nothing.")
    sys.exit(1)
if bad:
    print("cosmo-scrub gate FAILED:")
    for b in bad:
        print("  " + b)
    sys.exit(1)
print(f"cosmo-scrub gate: {refs} external references (no values shipped),"
      f" {synth} open-licence profiles; 0 restricted values in the public tree;"
      f" every variant-\"2002\" set names VT-2005 or a SYNTHETIC surrogate and"
      f" no VT2005 set is installed"
      f" ({ndat} records enumerated; an absent or collapsed scan root REFUSES)")
sys.exit(0)
