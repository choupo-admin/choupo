# thirdParty/thermoml — the NIST/TRC ThermoML Archive

## The source

The ThermoML Archive of the NIST Thermodynamics Research Center: roughly 11 900
journal articles' experimental thermophysical data, each as one XML file in the
ThermoML schema.  Published at data.nist.gov, DOI **10.18434/mds2-2422**.

## Licence — read carefully, it bifurcates

**The archive record grants NIST's open licence** (`nist.gov/open/license`;
formal record field `"license"`).  **That licence disclaims third-party
rights, in capitals**: the ARRANGEMENT is NIST's, the MEASUREMENTS inside
belong to the articles and their publishers.  Read 2026-08-25; the full reading
and what turns on it is in
[`docs/design/thermoml-archive-assessment.md`](../../docs/design/thermoml-archive-assessment.md).

## Does Choupo redistribute it?

**No, and the rule is stricter than "no":**

- The cache (`ThermoML.v2020-09-30.tgz`, the extracted `xml/`, `index.json`)
  is gitignored and is **your** mirror, installed by `bin/choupo-thermoml sync`
  and verified against the sha256 the NIST record publishes.
- **The runtime never reads it.**
- **No value enters a Choupo record from the archive as such.**  A value
  enters only by a human reading the ORIGINAL ARTICLE the archive points at and
  citing THAT — the archive is a finding aid, and `bin/choupo-thermoml` prints
  authors, title, journal, year and DOI for exactly that purpose.
- **Bulk import into `data/standards/` is RESERVED — Vítor and counsel**, not
  an assistant's call in either direction: the open licence argues for; the
  third-party disclaimer, the publishers' named permission and the
  provenance-laundering clause of Choupo's own licence policy argue against.

## The version

The NIST record (data.nist.gov, ark:/88434/mds2-2422, record version 1.2.6,
read 2026-09-28) distributes ONE data file, `ThermoML.v2020-09-30.tgz`
(189 433 115 bytes, sha256 `231161b5...7ec2`).  No later archive exists: the
record's release history lists metadata and data updates only up to that
tarball, and the archive's own search API returns publications up to 2019
and none for 2020-2025 (queried by year, 2026-09-28).  The NIST licence
page was re-read the same day and still carries both sentences quoted in
the assessment (17 U.S.C. 105; no warranty of non-infringement of third
party rights); the TRC page still says the files are "available with
permission of the journal publishers".

## What reads it, and how

`bin/choupo-thermoml` is the ONE toolchain (2026-08-25; there used to be two):
`sync` · `index` · `search [--online]` · `extract` · `extract-vle`, and since
2026-09-28 (C16) `identity` · `vle-index` · `vle-search`:

- `identity` -- the archive names compounds by InChI/InChIKey and carries NO
  CAS number (0 of 58 276 binary blocks); the catalogue names them by CAS and
  carries no InChIKey.  The bridge asks two resolvers (PubChem PUG REST, NCI
  CACTUS) for each catalogue CAS and accepts an InChIKey only when they AGREE
  and the formula matches the record's own; everything else is listed.  The
  result is `identity.json` here, gitignored.
- `vle-index` / `vle-search` -- every binary vapour-liquid block with its
  geometry (bubbleT, bubbleP, vapourComposition, ...), T and P span, whether
  it states uncertainties, DOI, and the catalogue component + CAS each
  compound joins to.  A finding aid: it copies no data point.
- `extract-vle` now joins its two compounds BY INCHIKEY (refusing an
  unjoined one instead of trusting the archive's name), keeps the per-point
  expanded uncertainty, joins the companion vapour-composition block when it
  is unambiguous, sets pure-component endpoints aside with `--interior-only`
  (kept in the file), and REFUSES a block that repeats an observation.

**What entered the tree through it (C16).**  Ten measured bubble-point
series, one per file under the five cases
`tutorials/props/curation/curate04..08`, each citing its ARTICLE (authors,
title, journal, DOI) and marked `reviewStatus
transcribedNotCheckedAgainstArticle` -- the tier-2 route of the assessment,
with its condition ("checked against it when the paper is in hand") still
OPEN and announced on every run.  Ten series of 13-54 points is not the bulk
import the assessment reserves.  The NRTL pairs regressed to them are
Choupo's own parameters and live in `data/standards/parameters/NRTL/`.  An
unresolvable component REFUSES rather than being guessed; a multi-block article
demands `--block N`, because choosing is the curator's act.  Extracted evidence
goes to `data/local/` for review — witness: an NRTL fit across three isobars
from one article, `docs/design/held-out-pressure.md` §8.

## Format

One ThermoML XML per article under `xml/`, keyed by DOI; `index.json` is the
local index the `search` command reads.

Verified 2026-09-06 against the assessment above; the licence texts themselves
were read 2026-08-25 and again 2026-09-28.
