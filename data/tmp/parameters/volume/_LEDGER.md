# `parameters/volume/` -- apparent/partial molar volume in water (arity 2)

PRIVATE tier (`data/tmp/`, gitignored). Created **2026-07-24** by
`agent:components-sugars` during **phase 3** (component cleanup), not by phase 2.

## Why this home exists

Six sugar component files carried a top-level `Vliq` field. The comment beside it
said what it really was: *"apparent (partial) molar volume in aq. soln"*, cited to
Galema & Hoiland 1991 (monosaccharides) or "Banipal et al." (disaccharides).

An apparent/partial molar volume at infinite dilution is **not a pure-component
property**: it is the volume change of *water* on adding one mole of solute -- a
**solute + solvent** quantity, arity 2. It therefore cannot live in a component
file (`RECORD_SPEC.md` ARITY rule), and it is *not* the same number as the
pure-solid molar volume `MW/rho`, which is arity 1 and stays in the component.

Phase 2 emitted no home for this quantity, so phase 3 created one rather than
delete the values. **Nothing was re-derived, converted or improved** -- each value
and its citation were moved verbatim from the component file it left.

## Records emitted -- 6

| recordId | V0 (cm3/mol) | T (K) | origin | status | primary |
|---|---|---|---|---|---|
| `volume-fructose-water`  | 110.6 | 298.15 | measured | candidate | Galema & Hoiland, *J. Phys. Chem.* 95 (1991) 5321 |
| `volume-galactose-water` | 110.2 | 298.15 | measured | candidate | Galema & Hoiland 1991 |
| `volume-xylose-water`    | 95.4  | 298.15 | measured | candidate | Galema & Hoiland 1991 |
| `volume-arabinose-water` | 93.4  | 298.15 | measured | flagged   | Galema & Hoiland 1991 -- enantiomer/anomer of the cited series unverified |
| `volume-lactose-water`   | 209.1 | 298.15 | measured | flagged   | "Banipal et al." -- **citation unresolved** (author only) |
| `volume-trehalose-water` | 207.6 | 298.15 | measured | flagged   | "Banipal et al." -- **citation unresolved** |

## Findings

1. **Two disaccharide values rest on an author-name-only citation.** "Banipal et
   al., disaccharide partial molar volumes" is not a resolvable reference -- no
   journal, volume, year or pages exists anywhere in the staging tree. Both
   records are `flagged` for that reason alone; the numbers themselves are the
   right size (sucrose 211.5 cm3/mol).
2. **Neither disaccharide record's temperature was ever stated.** 298.15 K is
   carried because that is the convention of the series, not because a source
   said so. Declared in-file as unverified.
3. **The pure-solid and partial molar volumes differ systematically** (e.g.
   galactose 120.1 vs 110.2 cm3/mol, ~9 %). That is real physics -- crystal
   packing versus hydrated solute -- and the two must never be interchanged. Each
   component file now says so at its `solidMolarVolume` derivation.
4. **The polyols have no record here**: their component files carried only the
   *pure-solid* volume `MW/rho` (arity 1, retained in place), never a partial
   molar volume.

---

# PHASE 6 — clearing `flagged` by hunting the missing evidence (2026-07-24)

Scope here was the **3 flagged** `partialMolarVolume` records.  Their blocker was
never the number — it was that **two of them rested on an author-name-only
citation** and the third on a citation with no page range, no DOI and an
unverified stereochemistry.  Phase 6 attacked the citations.

**Result: 0 → candidate, 3 sharpened, and 2 of the 3 citations RESOLVED.**
No value was changed, no digit verified (that needs the papers), and no record
was promoted — the identifications are **bibliographic, not confirmatory**, and
each file now says so in its own words.

| record | old status / origin | what was searched | what was found | new status |
|---|---|---|---|---|
| `volume-lactose-water` (209.1 cm³/mol) | flagged / measured, **citation author-only** | Crossref bibliographic search on the only fragment the tree carried ("Banipal … disaccharide partial molar volumes") | **Banipal, P. K.; Banipal, T. S.; Lark, B. S.; Ahluwalia, J. C., *Partial molar heat capacities and volumes of some mono-, di- and tri-saccharides in water at 298.15, 308.15 and 318.15 K*, J. Chem. Soc., Faraday Trans. 93 (1997) 81-87, doi `10.1039/a604656h`.** Closed (Unpaywall `is_oa=false`), no repository copy | flagged, `pendingPrimary {}` added |
| `volume-trehalose-water` (207.6 cm³/mol) | flagged / measured, **citation author-only** | same | same paper | flagged, `pendingPrimary {}` added |
| `volume-arabinose-water` (93.4 cm³/mol) | flagged / measured, **anomer/enantiomer unverified** | Crossref | citation **completed**: Galema, S. A.; Høiland, H., *Stereochemical aspects of hydration of carbohydrates in aqueous solutions. **3.** Density and ultrasound measurements*, J. Phys. Chem. 95 (1991) **5321-5326**, doi `10.1021/j100166a073` — page range and DOI were both missing before. Closed (ACS also down for platform migration that day) | flagged, `pendingPrimary {}` added |

## Why the Banipal identification is more than a guess

Three independent things line up, and all three are recorded in the files:

1. **Scope.** It is the *only* Banipal saccharide-volume paper measured in **water
   alone**.  The two siblings Crossref returns alongside it are *transfer* volumes
   into aqueous **urea** (*J. Chem. Thermodyn.* 32 (2000) 1409) and into aqueous
   **NaCl** (34 (2002) 1825) — neither is a water-only V°, so neither can be this
   source.
2. **Temperature.** Phase 3 recorded that *"neither disaccharide record's
   temperature was ever stated; 298.15 K is carried because that is the convention
   of the series"*.  This paper's temperature set is **exactly 298.15 / 308.15 /
   318.15 K** — which independently explains where the unsourced 298.15 K came from.
3. **Magnitude.** 209.1 and 207.6 sit within 4 cm³/mol of sucrose's 211.5, as
   isomeric disaccharides should.

That is a strong identification and a **weak verification**.  Hence the explicit
instruction now written into both files: obtain the article, **confirm the digit
against its table**, and — if it does not match — **delete the number with a
structured absence** exactly as phase D deleted 48 unsupported values, rather than
quietly re-pointing it at whatever the paper does report.

## What the Galema identification fixes, and what it does not

Completing the citation settles *which* paper (part **3** of the series is the
density/ultrasound one; parts 1 and 2, *JACS* 112 (1990) 9665 and *J. Org. Chem.*
57 (1992) 1995, are kinetic-medium-effect papers containing no partial molar
volumes).  It does **not** settle the record's actual blocker.  The action now
separates the two questions the phase-3 note had fused:

* **enantiomer** — D- vs L-arabinose share V° by symmetry, so this is an
  identity/labelling matter only;
* **anomeric composition** — *this* is the one that can move the digit, and it is
  precisely what a stereochemistry-centred series would vary.

## COUNTS

| | before phase 6 | after phase 6 |
|---|---|---|
| records | 6 | 6 |
| `candidate` | 3 | **3** |
| `flagged` | 3 | **3** |
| flagged records with an **unresolvable** citation | 3 | **0** |
| flagged records with a resolved primary + DOI awaiting digit confirmation | 0 | **3** |

* flagged → candidate: **0**
* new records created: **0** (nothing was found that warranted one, and no value
  was invented)
* still flagged, every one with a sharpened action: **3**

---

# PHASE 7 — OBTAIN-AND-READ the identified primaries (2026-07-25)

Phase 6 *resolved the citations*; phase 7 tried to **obtain the papers and CONFIRM
the digit against the table**.  Rule: identification is not verification — confirm
and the record becomes candidate, disagree and the number is deleted with a
structured absence, unreadable and it stays flagged with the DOI.

**Retrieval outcome: all three primaries UNREACHABLE for full text on 2026-07-25.**
WebSearch budget was exhausted; retrieval was by direct DOI fetch + open metadata
APIs.  RSC (`pubs.rsc.org`) and ACS (`pubs.acs.org`) both returned HTTP 403 (the
ACS platform-migration outage was still active); Unpaywall reports `is_oa = false`
with no OA location for either DOI; no repository copy exists.

| record | primary | obtained? | digit confirmed? | new |
|---|---|---|---|---|
| `volume-lactose-water` (209.1 cm³/mol) | Banipal 1997, doi 10.1039/a604656h | **no** (RSC 403) | **no** | `phase7Retrieval` block added; number NEITHER promoted NOR deleted |
| `volume-trehalose-water` (207.6 cm³/mol) | Banipal 1997, doi 10.1039/a604656h | **no** (RSC 403) | **no** | same |
| `volume-arabinose-water` (93.4 cm³/mol) | Galema & Høiland 1991, doi 10.1021/j100166a073 | **no** (ACS 403) | **no** — anomeric composition still the open blocker | `phase7Retrieval` block added |

## COUNTS (phase 7)

| | after phase 6 | after phase 7 |
|---|---|---|
| records | 6 | 6 |
| `candidate` | 3 | 3 |
| `flagged` | 3 | 3 |

* flagged → candidate: **0**
* deleted on disagreement: **0** (no digit was READ; deletion requires a read
  primary that contradicts the number)
* still blocked by an unreachable source: **3** (both Banipal V0 digits + the
  Galema arabinose V0/anomer question) — each record now carries a `phase7Retrieval`
  block recording the 403 and reaffirming the DOI for a future retrieval.
