#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
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


THREE ARMS ADDED 2026-11-11 (DEV.md 4c C310; record
docs/design/cosmo-sac-lvpp-hftzvp-2018.md): the engine now carries a second
variant, `LVPP-HFTZVP-2018` (Ferrarini et al. 2018 constants on the LVPP
18.07 GAMESS HF/TZVP profiles), and the rule "never a profile under another
variant's constants" is held BOTH WAYS:
  (vi)  a set declaring `variant "LVPP-HFTZVP-2018"` REFUSES unless its
        `protocol` is, word for word, the LVPP18_PROTOCOL string the engine
        demands (read from CosmoSac.cpp, never repeated here), its `source`
        names LVPP release 18.07 and HF_TZVP, it declares `licence MIT;`, and
        its source names no other profile database (VT-2005, NWChem, v25,
        CHAOS) -- a VT-2005 or NWChem profile under these constants is the
        2026-07-24 failure in the other direction.
  (vii) a set declaring any OTHER variant word REFUSES: the engine runs two.
  (v')  a `variant "2002"` set carrying a `protocol` REFUSES (a protocol
        line is how a non-VT profile announces itself).
  SABOTAGES 2026-11-11, each on a temporary tutorials/**/zz_sabotage.dat
  holding acetone's shipped LVPP-HFTZVP-2018 set, deleted after (observed
  refusals, abridged):
    S5  protocol "... f_decay 1.0 ..."   -> (vi) "its protocol is ..., the
        engine demands ..."
    S6  source "release v25 NWChem ..."  -> (vi) "does not name LVPP release
        18.07 HF_TZVP; ... names another profile database (v25)"
    S7  variant "2002" on the LVPP set   -> (v) foreign LVPP source AND (v')
        "declares variant 2002 and a profile protocol"
    S8  variant "2010"                   -> (vii) "implements 2002 and
        LVPP-HFTZVP-2018 only"
    S9  licence unknown;                 -> the open-licence arm AND (vi)
        "does not declare `licence MIT;`"
    S10 (negative) the set as shipped    -> no refusal.
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
LVPP18 = "LVPP-HFTZVP-2018"
#  The protocol is READ from the engine, never repeated: the gate and the
#  engine must refuse the same strings.
_pm = re.search(r'LVPP18_PROTOCOL\s*=\s*"([^"]+)"',
                (ROOT / "src/thermo/activityCoefficient/CosmoSac.cpp").read_text())
if not _pm:
    print("cosmo-scrub gate FAILED: LVPP18_PROTOCOL not found in CosmoSac.cpp --"
          " arm (vi) cannot know what the engine demands")
    sys.exit(1)
LVPP18_PROTOCOL = _pm.group(1)


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
    pm = re.search(r'protocol\s+"([^"]*)"', body)
    protocol = pm.group(1) if pm else None
    if variant == "2002" and protocol is not None:
        bad.append(f"{p.relative_to(ROOT)}: set '{setName}' declares"
                   f" variant \"2002\" and a profile protocol ('{protocol}')"
                   f" -- the 2002 constants were fitted to VT-2005 profiles,"
                   f" which carry none; a protocol line announces a foreign"
                   f" profile (arm v')")
    if variant == LVPP18:
        why = []
        if protocol != LVPP18_PROTOCOL:
            why.append(f"its protocol is {protocol!r}, the engine demands"
                       f" {LVPP18_PROTOCOL!r}")
        if not (re.search(r'\bLVPP\b', src) and "18.07" in src and "HF_TZVP" in src):
            why.append("its source does not name LVPP release 18.07 HF_TZVP")
        if not re.search(r'licence\s+MIT\s*;', body):
            why.append("it does not declare `licence MIT;`")
        other = re.search(r'VT-?2005|NWChem|nw-b3lyp|\bv25\b|\bCHAOS\b', src)
        if other:
            why.append(f"its source names another profile database ({other.group(0)})")
        if why:
            bad.append(f"{p.relative_to(ROOT)}: set '{setName}' declares"
                       f" variant \"{LVPP18}\" but " + "; ".join(why) +
                       " -- these constants were fitted to LVPP 18.07 HF/TZVP"
                       " profiles built one exact way, and any other profile"
                       " runs to a silently wrong gamma (arm vi)")
    if variant and variant not in ("2002", LVPP18):
        bad.append(f"{p.relative_to(ROOT)}: set '{setName}' declares variant"
                   f" \"{variant}\" -- the engine implements \"2002\" and"
                   f" \"{LVPP18}\" only (arm vii)")
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
        for m in re.finditer(r'([\w-]+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}', t):
            body = m.group(2)
            if "sigmaProfile" not in body and "variant" not in body:
                continue
            #  Arms (v) and (i) read LEAF sets.  The block regex above is
            #  NON-OVERLAPPING, so the enclosing `cosmo {}` consumes every
            #  leaf inside it and a leaf never matches on its own -- the
            #  first draft skipped bodies containing "{" and therefore ran
            #  on nothing (S3 survived; caught by hand, 2026-09-06).  The
            #  leaves are re-extracted from the enclosing body instead.
            #  The LICENCE arms read leaves too (2026-11-11): one `cosmo {}`
            #  now holds a restricted VT2005 reference AND an open LVPP set,
            #  and judged as one body the pair read as "a profile under a
            #  restricted licence".
            leaves = (re.findall(r'([\w-]+)\s*\{([^{}]*)\}', body)
                      if "{" in body else [(m.group(1), body)])
            for setName, leaf in leaves:
                restricted = "externalRestricted" in leaf or "REQUIRES REVIEW" in leaf
                hasProfile = "sigmaProfile" in leaf
                openSrc = (re.search(r'source\s+"[^"]*(SYNTHETIC|GPL|public domain|CC-BY(?!-NC))[^"]*"', leaf)
                           or (re.search(r'variant\s+"' + LVPP18 + '"', leaf)
                               and re.search(r'licence\s+MIT\s*;', leaf)))
                if hasProfile and restricted:
                    bad.append(f"{p.relative_to(ROOT)}: set '{setName}' carries a"
                               f" sigmaProfile under a restricted licence --"
                               f" redistribution; strip it to an external reference")
                if hasProfile and not restricted and not openSrc:
                    bad.append(f"{p.relative_to(ROOT)}: set '{setName}' carries a"
                               f" sigmaProfile with no open-licence declaration in"
                               f" its source -- declare the terms or strip it")
                if hasProfile and openSrc:
                    synth += 1
                if not hasProfile and restricted:
                    refs += 1
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
print(f"cosmo-scrub: OK -- {refs} external references (no values shipped),"
      f" {synth} open-licence profiles; 0 restricted values in the public tree;"
      f" every variant-\"2002\" set names VT-2005 or a SYNTHETIC surrogate,"
      f" every {LVPP18} set carries the engine's protocol, and"
      f" no VT2005 set is installed"
      f" ({ndat} records enumerated; an absent or collapsed scan root REFUSES)."
      f"  NOT checked: a `source` string that lies about where its numbers came"
      f" from, and whether a profile was really built under the protocol it"
      f" declares (check_cosmo_lvpp_selection holds the shipped ones by result).")
sys.exit(0)
