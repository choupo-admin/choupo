# thirdParty/ — what Choupo KNOWS about, separately from what it SHIPS

**A card here is not redistribution.**  Each subdirectory holds a `README.md`
recording an external source: where it comes from, who owns it, what its licence
says, **whether Choupo redistributes it**, how you obtain your own copy, what
format to expect, and which tool reads it.  The card is tracked; the data is
gitignored.  A source with no shippable values still gets a card — otherwise it
disappears from the project's memory the moment somebody decides its numbers may
not be entered, and two years later a reader assumes afresh that "it is on the
NIST site, so it is public domain".  (That exact sentence was written into this
project twice and was false both times.)

The separation this expresses:

| | |
|---|---|
| `data/standards/` | data Choupo curates and **may** redistribute |
| `data/local/` | your private working tier, gitignored, never shipped |
| `thirdParty/` | **knowledge about** external data Choupo does **not** redistribute |

**The runtime never reads this tree.**  Curation tools do, offline, and write
their output to `data/local/` for a human to review before anything is promoted.

**No tool here downloads a restricted dataset.**  Where a source is restricted,
you fetch your own copy and an importer installs it (`bin/choupo-import-cosmo`);
that boundary is deliberate and a card must not become an indirect route around
it.  A public-domain source may be fetched by a tool, and its card says so.

## The sources

| card | source | licence | shipped by Choupo? |
|---|---|---|---|
| [`chemsep/`](chemsep/README.md) | ChemSep pure-component databank + binary pairs | Artistic-2.0 | no — curated subsets go to `data/local/` |
| [`thermoml/`](thermoml/README.md) | NIST/TRC ThermoML Archive (~11 900 article XMLs) | NIST open licence; third-party IP in the underlying articles disclaimed | no — a value enters only by a human citing the ORIGINAL ARTICLE |
| [`svehla/`](svehla/README.md) | NASA TR R-132 (1962), Lennard-Jones σ and ε/k | US government work, public domain | the report no; the page-image transcription in `bin/curate/svehla1962/` yes, deliberately |
| [`lvpp-sigma/`](lvpp-sigma/README.md) | LVPP open COSMO sigma-profile database (~2500) | MIT | no — and the reason is thermodynamic, not legal (read the card) |
| [`vt2005-cosmo/`](vt2005-cosmo/README.md) | VT-2005 sigma-profile database (1432) | non-commercial via BioVia permission; the original page states no licence at all | no, and no data file is present |
| `BURCAT.THR` | Extended Third Millennium Ideal Gas Thermochemical Database | **NonCommercial** — "free of charge for non commercial use" | no, and no NEW record may cite it as a value's origin (`check_source_licence` enforces this; the records that already do are pinned in `debt_registry.NC_COMPILATION` with their remedy) |

Species imported from a permitted source become Choupo `.dat` entries in
`data/standards/components/` with a **per-value primary citation**: the imported
VALUES are cited facts, and the bulk file itself stays out of the repository.

## Adding a card

Copy the shape of an existing one and answer, in this order: the source and how
to cite it · the licence, with the primary text quoted verbatim and the date it
was read · whether Choupo redistributes it and why · how to obtain a copy · the
format · what reads it · the design record that settled any decision about it.
Then make `bin/curate/check_source_licence.py` name the card, so the gate and
the prose cannot drift apart.
