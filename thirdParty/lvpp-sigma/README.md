# thirdParty/lvpp-sigma — the LVPP open sigma-profile database

## The source

`https://github.com/lvpp/sigma` — COSMO sigma profiles for roughly 2500
molecules, from the Laboratório Virtual de Predição de Propriedades (UFRGS).

Cite: Ferrarini, F., Flôres, G. B., Muniz, A. R., Soares, R. de P., *AIChE J.*
**64** (2018) 3443; Soares, Mejía-Rodríguez, Aprà, *J. Chem. Theory Comput.*
(2025), doi:10.1021/acs.jctc.5c01368; DOI 10.5281/zenodo.3613785.

## Licence

**MIT** (Copyright (c) 2017 LVPP), text in `LICENSE` beside the data.  Openly
redistributable, including commercially — the cleanest licence position of any
COSMO source known to this project.

Verified 2026-09-06.

## Does Choupo redistribute it?

**No — and the reason is THERMODYNAMIC, not legal.**  This is the important
sentence on this card, because the licence would allow it and the physics does
not.

`data/tmp/COSMO_VALIDATION_STUDY.md` (2026-07-24) measured what happens when
LVPP profiles are used with the constants of the `cosmoSAC2002` variant, which
were regressed against VT-2005 surfaces: water at infinite dilution in acetone
moves from γ = 4.69 to 0.97 — **the sign of the excess Gibbs energy flips** —
and γ∞ of water in n-hexane falls by a factor of 2.8.  A sigma-profile set, the
quantum-chemistry protocol that produced it, and the COSMO-SAC parameterisation
fitted to it are ONE object and may not be mixed.

So an LVPP set would need its own declared `variant` with that
parameterisation's own constants — which is a NEW `ActivityModel` subclass, not
a data import: CS25 replaces the Staverman-Guggenheim combinatorial with a
modified Flory-Huggins, adds an atom-pair dispersion term needing per-segment
atom typing the `sigmaProfile ( 51 values );` grammar cannot express, and splits
the hydrogen bond into six donor/acceptor classes.  GMHB1808 is closer to the
classical form but was fitted to GAMESS profiles, not to the NWChem
`release_v25` files staged here — so it is not a legitimate pairing either.

**RESERVED for Vítor** (task #95): whether to build that variant.  Until it
exists, an LVPP profile has nothing correct to be computed with, and writing
`variant "2002"` on one would defeat the only guard standing between it and a
silently wrong activity coefficient.

## What is here, and what reads it

`nw-b3lyp-svpd-v25.zip` (the NWChem release), `LICENSE`, `SHA256` — gitignored;
fetch your own from the repository above.  Nothing in the runtime reads this
tree.  `data/tmp/_sources/cosmo_tools/` holds the study's generator and panel,
which read it offline.

Records: [`docs/design/the-licence-of-a-sigma-profile.md`](../../docs/design/the-licence-of-a-sigma-profile.md)
and `data/tmp/COSMO_VALIDATION_STUDY.md`.
