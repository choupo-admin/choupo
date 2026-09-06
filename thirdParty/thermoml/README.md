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

## What reads it, and how

`bin/choupo-thermoml` is the ONE toolchain (2026-08-25; there used to be two):
`sync` · `index` · `search [--online]` · `extract` · `extract-vle`.  An
unresolvable component REFUSES rather than being guessed; a multi-block article
demands `--block N`, because choosing is the curator's act.  Extracted evidence
goes to `data/local/` for review — witness: an NRTL fit across three isobars
from one article, `docs/design/held-out-pressure.md` §8.

## Format

One ThermoML XML per article under `xml/`, keyed by DOI; `index.json` is the
local index the `search` command reads.

Verified 2026-09-06 against the assessment above; the licence texts themselves
were read 2026-08-25.
