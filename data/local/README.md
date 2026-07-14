# data/local/ — your private working data (never public)

This directory is the **private tier** of the Choupo data model.  In the
public repository it ships **empty** (only this README and a `.gitkeep`);
everything you put here is **gitignored** and never leaves your machine.

## The two-tier model

Choupo has exactly two data homes — there is no public "proposed" tier:

| tier | where | public? | what |
|---|---|---|---|
| **standards** | `data/standards/` | **yes** — committed | curated, verified, committee-managed reference data |
| **local** | `data/local/` | **no** — gitignored | *your* imported / licensed / unverified working data |

Data is either **curated and public** (`standards`) or **yours and private**
(`local`).  Promotion from `local` to `standards` is a deliberate curation act.

## Resolution order

When a case does not declare a value inline or case-local, the engine looks
it up in this order:

```
case (inline / constant/) ->  standards  ->  local  ->  ideal default
```

The case always wins (author an inline pair and see its effect).  Among the
shared catalogue, **standards (curated) takes precedence over local**; local
fills the gaps standards does not cover.  A value resolved from `local` is
announced as `[local] UNVERIFIED` — never silent.

## What goes here

* binary interaction parameters you import (e.g. from your own ChemSep copy
  via `bin/curate/chemsep_to_choupo.py`, which writes here);
* component records and property estimates you generate or license;
* `fitParameters` proposals (regression results awaiting your curation);
* any third-party dataset whose redistribution you have not established.

Because it is private, `data/local/` is where third-party values live without
ever being redistributed by the public repository.  The public repo ships
Choupo's OWN open group-contribution ESTIMATES (`data/groupEstimative/`, clearly
flagged) rather than any third-party values; you import measured or curated
third-party data here privately.
