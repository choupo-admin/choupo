# The delegated INTERIM review — 2026-08-24

**Commissioned by Vítor** ("Podes ser tu a rever com os teus generais?"), same
day the primary PDF of Edwards (1978) entered the session.  Method: three
INDEPENDENT reviewers, each blind-protocolled (transcribe the source first,
open the records second), their findings AUDITED against the primary page or
the cited distribution before anything landed — the auditor rule applies to
reviewers too.  **Promotion is not claimed here**: this dossier is the
review; removing an INTERIM mark stays the owner's word on top of it.

## Reviewer 1 — the 33 EdwardsPitzer records vs the paper

Every numeric parameter, every vInfinity point, every Henry and
molecule-ion Trange: **exact agreement** with an independent transcription
of Tables 2–6, the two tabulated zeros (CO2–HS⁻, H2S–HS⁻) and Table 5's
HS⁻ 0.074 included.  The absent `ion-S.dat` is the documented deferral
(no species/S, first dissociation only), not a gap.

**One real finding, audited against p. 969 and CORRECTED (fc51a391e):**
`NH3aq.dat` and `H2Saq.dat` declared their Eq 14 window as 0–170 °C "the
paper's stated correlation range"; the paper ties Eq 14 to "the same
temperature range as that used for Henry's constants" and Table 3 gives
both as 0–150 °C — the 0–170 is Figure 4's plotted span.  Both windows
narrowed to 423.15 K; the three sealed Edwards cases (the review's own
subject) resealed, agree-checks green, zero numbers moved.  Direction of
the error: WIDER than the source — the direction that silences an
extrapolation announcement.

## Reviewer 2 — the derived arithmetic, recomputed from scratch

All analytic conversions in the edwards02/03 case-local chemistry
(Table 1 rows → PHREEQC form, the Eq 20 carbamate with water as product,
the mass-action directions, the nuWater signs): **exact to stored
precision** (coefficient diffs ≤ 5e-6, logK25 diffs ≤ 4e-5 — last-digit
rounding).  The Edwards-vs-PHREEQC gaps the headers quote (0.008–0.009 in
logK25) reproduce as written.  One sub-threshold flag resolved on audit:
three "engine-printed" β⁰ values in the briefing were the session's own
hand arithmetic, not the engine's print — the stored records are exact;
the defect was in the briefing.

## Reviewer 3 — species and components outside the Edwards set

* **species/CO2aq.dat** — hfAq −413 800 / sAq 117.6: two independent open
  secondaries agree exactly (one is the cal→J conversion of NBS's own
  −98.90 kcal/mol); the NBS primary itself (public domain, srd.nist.gov)
  is blocked by THIS sandbox's proxy, not by any paywall.  Verdict:
  CONSISTENT-UNVERIFIED — one sitting with the NIST PDF converts it to
  VERIFIED.  MW verified by arithmetic.
* **The 11 Millero V0 blocks** — H⁺ definitional; Na⁺ verified against an
  open derivation of exactly Millero's convention (16.61 − 17.82 = −1.21);
  Cl⁻ within 0.01 of the open copy; the other eight PLAUSIBLE, mutually
  coherent, primary (ACS, paywalled) unreachable — the batch primary
  review their source lines promise remains the only path to VERIFIED.
  HCO3⁻ keeps its own "review first" flag.
* **The 13 Antoine blocks** — ALL VERIFIED against the cited MIT-licensed
  `chemicals` 1.5.2 distribution (wheel downloaded and diffed): 9 exact
  Poling matches, 1 exact Landolt ln→log10 conversion, 3 curation fits
  reproduced at their claimed deviations (0.05 %, 0.05 %, 2.4 %); every
  record's Psat(Tb) lands within 0.14 K of its own declared Tb.  What
  stays INTERIM is the UPSTREAM question (Poling/Perry/Landolt as the
  primaries), which the marks correctly describe.  Two nits corrected
  after this audit re-verified them against the wheel:
  - HCHO's header said "Wagner-25 curve"; the fit target is the
    Wagner-ORIGINAL (3-6) form of McGarry 1983 (reproduced at 0.050 %
    against that form, 17 % against the 2.5-5 form — decisive).  The
    word fixed, no number touched.
  - Six Trange windows rounded up to ~0.5 K OUTSIDE the source fit range
    (Cl2, N2, N2O, NO, ethylAcetate, propylene) — clamped to the source's
    exact endpoints.  The same error class as the Edwards windows, three
    orders of magnitude smaller.
* **aceticAcid-dissolution.dat** — the Henry derivation arithmetic is
  exact from its own quoted inputs; the vapour-dimer ΔH carries a PINNED
  TENSION, not a change: an open secondary quoting the same primary
  (Chao & Zwolinski 1978) implies ΔH_dim = −63.8 kJ/mol against the
  stored −58.5.  Snippet-level evidence only; the record's own
  `primarySourceRecheck` is where this gets settled.  DO NOT adjust the
  value on this dossier's authority.

## The 78 sealed mirrors

78 sealed cases mirror the six clamped Antoine windows at their old
values.  They are deliberately NOT resealed: a seal is the photograph of
the data the case ran with — that is its contract — and a ≤0.5 K validity
sliver moves no number in any of them.  Each picks up the correction at
its next natural reseal.  (The three Edwards cases WERE resealed: they
are the review's own subject.)

## What promotion would mean, per group

| group | review outcome | promotion decision |
|---|---|---|
| 33 EdwardsPitzer + 8 case-local chemistry | verified against the primary in hand, twice over | **PROMOTED 2026-08-24** on the owner's delegation ("Avança como achares melhor e de acordo com a filosofia de Gall") — the 8 case-local source strings now cite this dossier instead of "INTERIM pending"; both cases resealed, goldens intact.  The 33 standards records never carried a parsed mark; this dossier and the commit record are their review record. |
| species/CO2aq.dat | consistent with two open secondaries; NBS row unsighted | KEPT INTERIM — the claim "reviewed against the primary" would be false by one unsighted page |
| 13 Antoine blocks | transcription fully verified vs the cited distribution | KEPT INTERIM — the marks describe the UPSTREAM question (Poling/Perry/Landolt as primaries), and that question is still true |
| 11 Millero V0 | 3 confirmed, 8 plausible-unreached | KEPT INTERIM — needs the paywalled primary |
| acetic dimer ΔH | tension pinned | KEPT INTERIM — recheck first |

The promotion boundary IS the Gall reading of the delegation: claim exactly
what was verified, keep every mark that still tells the truth.
