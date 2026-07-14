# Property-estimation program — design record (POST-RELEASE feature)

**Status:** design record, NOT implemented.  Captured 2026-07-13 from a
curation-bench investigation (isolated venv: `chemicals` + `thermo` + `rdkit`,
all MIT/BSD).  This is a **post-release** feature — it does not block the
Choupo-2607 publication.  It refines, with evidence, the property-estimation
half of the already-settled property architecture
(`docs/property-architecture.md`, settled 2026-06-05); it does not replace it.

## The evidence (why "Joback and done" is wrong)

Comparative demonstrator, estimate vs experimental, 16 compounds:

| property | Joback AAD | Wilson-Jasperson AAD |
|---|---|---|
| Tb | 10.2 % | — |
| Tc | 10.9 % | **2.6 %** (4× better) |
| Pc | 11.1 % | 7.7 % |

Joback fails **catastrophically** on small / polar / H-bonding molecules:
water Tc 339 vs 647 K, ethylene glycol, methane.  A Joback "estimate" for
water is dangerous garbage.  Wilson-Jasperson, given a decent Tb anchor, gets
Tc to 2.6 % AAD *and* gets water right (628 vs 647 K) — the physics doing the
work, not a fragile per-property group polynomial.  No group-contribution
method rescues water/glycol Pc — those must always be experimental/curated.

## The estimation LADDER (replaces single-method "Joback")

1. **Joback = bootstrap** — gives what nothing else gives from structure alone:
   Tb, Cp_ig(T), Hf, Gf, Hvap, Hfus.
2. **Wilson-Jasperson = anchors — BUT only with an EXPERIMENTAL Tb.**  Honest
   correction the evidence forced: WJ's 2.6 % Tc win holds only when fed a
   *measured* Tb.  Fed the *estimated* Tb (the real 28 k case), WJ does NOT beat
   Joback (11.9 % vs 10.9 %).  So the blind default is **auto-consistent
   Joback**; WJ is reserved for compounds that already ship an experimental Tb.
   (`method-comparison.csv` proves it — "see before deciding" stopped us
   shipping a worse default.)
3. **Corresponding states (Ambrose-Walton, Rackett — ALREADY in Choupo) =
   cascade** — Pvap, omega, densities fall out of the physics, not more groups.
4. **Every value carries `{origin, method, validity_range, uncertainty}`**;
   experimental > estimate, always annotated; water / glycol / small polar
   molecules flagged "GC-unreliable → requires experimental".
5. Advanced methods (Marrero-Gani, Nannoolal for Tb/Pvap; SAFT-γ Mie,
   COSMO-SAC, ML) are OFFLINE CURATION ORACLES ONLY — never runtime, never a
   code dependency (consistent with the settled PC-SAFT/COSMO-SAC rejection).

## Doctrine constraints (already settled — do not relitigate)

* Estimation is a CURATION act (glass-box `.dat`, human-reviewed), lands in the
  **private `data/local/` tier** (NOT the retired `data/proposed/`; NOT
  `data/standards/` — promotion is human and justified), per-value provenance.
* Compute the METHOD locally (Joback etc. are published, free to compute); cite
  the PRIMARY value where experimental exists; never bulk-redistribute a
  third-party experimental databank.
* **NEVER a blind dump of 28 k values** into any committed tier.

## Open question for the real forum (ChatGPT), NOT to decide ad-hoc

**RDKit at the curation bench.**  CLAUDE.md rejected "structure-first/RDKit".
The bench use here (offline SMARTS fragmentation producing a reviewable `.dat`,
outside the engine and outside runtime-read data) is arguably DIFFERENT from
the rejected structure-first-at-runtime architecture — but it pisa a settled
decision and must be ratified by Vitor / the design forum before adoption, not
assumed.

## Reproducible artifacts (curation bench, not in the repo)

Left in the session scratchpad (independent provenance — chemicals/PubChem
identity + DDBST group assignments via the thermo library, not a specific simulator):
`compounds-with-groups.csv` (28 823 compounds, identity + UNIFAC/Dortmund/PSRK
groups), `method-comparison.csv` + `demo_methods.py` (the demonstrator),
`SOURCES.md` (provenance/licence manifest), `chemvenv/` + `gen_all_compounds.py`.
Group-numbering caveat: some tools use INTERNAL subgroup ids (OH=15), DDBST uses the
PUBLISHED numbering (OH=14) — not interchangeable; each file is labelled.

## When this is built (post-release)

Cheap first step (glass-box "see then decide"): the comparative demonstrator is
done — the ladder default is chosen from evidence.  Then: a curation tool that
estimates ANY compound on demand into `data/local/` with the ladder +
provenance + GC-unreliable flags.  NOT a mass generation; the value is the tool,
not a static table.
