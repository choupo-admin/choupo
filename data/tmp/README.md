# data/tmp — provisional research staging (NOT searched by the engine)

This folder is a **research scratchpad** for expanding the standard component
catalogue.  The Choupo loader reads only `data/standards/`, `data/local/` and
`data/groupEstimative/` — **never `data/tmp/`** — so nothing here can affect a
run.  It IS versioned (Vítor, 2026-07-25): the staging work — candidates,
provenance, evidence, the legal sweeps — is tracked in the public repo so the
curation trail is auditable.  The one exception is the bulk upstream mirror
`_sources/lvpp_sigma/` (603 MB), carried as a git SUBMODULE pinned to the
public `github.com/lvpp/sigma` commit, not as copied blobs.

## What lives here
Candidate compounds found by trawling **public, legally-reusable** sources,
each carrying VERIFIED IDENTITY (a fact, not copyrightable) + provenance, so
Vítor can later curate them into real `data/standards/components/<name>.dat`.

`*.candidate.dat` — deliberately NOT `.dat` (belt-and-braces: even if this tree
were ever read, a candidate is not a component).  Each carries:
- identity (name, formula, MW, CAS, SMILES, InChI, InChIKey) — public-domain fact;
- a PROPOSED `groups { joback ( … ); }` block (FLAGGED — review it) that feeds
  Choupo's own estimator (`bin/estimate`), which computes the property values as
  Choupo's OWN open work — the legal path to numbers;
- a `NEEDS:` note listing which property blocks are still missing.

## The legal rule (CLAUDE.md §10, licence doctrine)
- **IN:** identity/structure facts from public-domain sources (PubChem = US-NIH,
  free of copyright), CC0 (Wikidata, ONS open datasets), CC-BY / CC-BY-SA data
  (cited PRIMARY, share-alike honoured on that data only).
- **OUT — never staged from here into the public repo:**
  - NonCommercial: **CAS Common Chemistry** (CC-BY-NC), CAS Registry arrangement.
  - No-grant / all-rights-reserved: **NIST WebBook/SRD, DIPPR, Yaws, CRC,
    Engineering Toolbox, REFPROP** — nothing to honour, do not copy their values.
- **Property VALUES** (Tc, Pc, ω, Antoine, Cp, ΔHf) are NOT copied from
  compilations — they come from Choupo's estimators over the staged structure, or
  from a genuinely open primary dataset with its citation.  A CAS *number* is a
  bare fact (fine); a curated *table of properties* is someone's work (respect it).
- Cite the PRIMARY source per value, never an aggregator's arrangement.

## GPL-3 distributability GUARANTEE (Vítor's explicit requirement)
Every staged record must be freely redistributable in the public Choupo repo.
The guarantee rests on TWO clean legs, and nothing else is admitted:
1. **Identity = public-domain fact.**  Formula, MW, a CAS *number*, InChI/InChIKey,
   SMILES, IUPAC name are facts (not copyrightable — Feist); PubChem places its
   compiled data in the public domain.  Freely distributable under any terms.
2. **Numbers = Choupo's OWN work, or a genuinely open primary.**  Property values
   come from Choupo's estimators (Joback/Lee-Kesler — GPL-3, our code) run over
   the staged structure, OR from a CC0 / public-domain primary dataset WITH its
   citation.  No value is ever transcribed from a restricted compilation.
Therefore a promoted component = (public-domain identity) + (GPL-3 Choupo estimate
or open-cited primary) → **redistributable in a GPL-3 project, no exceptions.**
If a value can only be had from a restricted source, it stays FLAGGED/absent
(never fabricated) until an open primary is found — that is the doctrine, not a gap.

## Promotion (later, by Vítor — not autonomous)
1. Review the identity + proposed groups.
2. `bin/estimate <name>` → glass-box Joback/Lee-Kesler property proposal.
3. Curate + primary-cite, then move to `data/standards/components/`.
