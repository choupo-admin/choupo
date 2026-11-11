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

**UPDATE 2026-11-11 (DEV.md 4c C310): a variant WAS built, on the OLDER
release.**  Not on `release_v25` (CS25's dispersion term and alpha' are still
unpublished -- Soares et al. 2025 §4.4: "details of this calibration will be
published elsewhere"), but on **release 18.07, GAMESS HF/TZVP**, with the
constants Ferrarini, Flores, Muniz & Soares published for exactly those
profiles (AIChE J. 64 (2018) 3443, p. 11).  The variant is
`LVPP-HFTZVP-2018`; the archive (`HF_TZVP.zip`, sha256 `bd17aaee...659d49`,
MIT) is unpacked under `thirdParty/lvpp-sigma-1807/` (gitignored, no card --
this card covers it); `bin/curate/lvpp_sigma_profile.py` builds each profile
and joins the archive to the catalogue by InChIKey; `data/standards/components`
now SHIPS those derived profiles under `licence MIT;` with the LVPP citation.
`check_cosmo_scrub` arm (vi) refuses any set of that variant whose protocol,
source or licence is not the 18.07 one.  The v25 statement above still holds:
no v25 profile is shipped or usable.  Record:
[`docs/design/cosmo-sac-lvpp-hftzvp-2018.md`](../../docs/design/cosmo-sac-lvpp-hftzvp-2018.md).

## What is here, and what reads it

`nw-b3lyp-svpd-v25.zip` (the NWChem release), `LICENSE`, `SHA256` — gitignored;
fetch your own from the repository above.  Nothing in the runtime reads this
tree.  `data/tmp/_sources/cosmo_tools/` holds the study's generator and panel,
which read it offline.

Records: [`docs/design/the-licence-of-a-sigma-profile.md`](../../docs/design/the-licence-of-a-sigma-profile.md)
and `data/tmp/COSMO_VALIDATION_STUDY.md`.
