# Audit: invariant I1 (arity) swept corpus-wide — 2026-08-05

> **STATUS: EVIDENCE.**  Findings from the first read-only fleet audit under
> [`development-governance.md`](development-governance.md), each independently
> re-verified by the architect before entry.  An audit produces evidence, never
> authority: nothing here becomes a contract until it is written, refused by
> name, and fired by a case.

**Invariant I1** — *a derived fact has exactly one home*
([`project-philosophy.md`](project-philosophy.md) §3).

Ground truth for every count below, re-derived by the architect from
`generated/releaseInventory.json` and the tree itself:
**247 components · 52 aqueous species · 331 runnable cases · 296 regression
checks.**

---

## The systemic finding — the detector's vocabulary is the hole, twice

`bin/curate/release_inventory.py` exists to stop hand-carried corpus tallies,
scans `README.md` among others, and **passes clean today** while `README.md`
line 153 says `## Tutorials (194)` against a corpus of 331.

The cause is `DOC_COUNT_PAT`, which matches `N <noun>` — digits *before* the
noun. `Tutorials (194)` puts them after, and a markdown table column puts them
in a cell. Neither is seen.

What makes this the finding rather than a bug: **the pattern's own comment
already records this exact class of failure**, from the last time —

> *"'N tutorials' was the phrasing this pattern did not have… A detector that
> only knows one wording catches only the wording it knows."*

The lesson was written down, the fix added one wording, and the next wording
walked through. A detector enumerating surface forms will always be one form
behind. **The remedy is to invert it: flag any digit near a corpus noun and
require justification, rather than matching known phrasings.**

## Confirmed divergences

| # | second home | claims | truth | note |
|---|---|---|---|---|
| A1 | `README.md:153,159-166` | 194 tutorials; steady 88, batch 11, ctrl 2, props 15, plant 15; 117 golden checks | 331; 196/42/15/65/11; 296 | `electrochem/` absent entirely; **inside** the gate's scan list |
| A2 | `docs/engine-capabilities.md:16-21` | 211 tutorials, 255 checks, 194 components | 331, 296, 247 | not scanned by any gate; **the same block's Henry/materials/membrane counts still agree** — half drifted, half not, which is the delay fuse |
| A3 | `paper/paper.md:43`, `paper.tex:276` | 288 cases, 255 checks | 331, 296 | **the JOSS submission**; its catalogue figures still agree |
| A4 | `site/releases.html:76` | 288 tutorials | 331 | `bin/buildSite:106` copies this page verbatim while feeding its neighbours the generator |
| A5 | `docs/userGuide.tex:967` | "194 species" | 247 components / 52 species | matches neither reading; **194 is the same dead number as A1** — one stale value with two homes |
| A6 | `.claude/skills/choupo-record/SKILL.md:25` | 25 gates | 83 | — |

## Confirmed stored derivatives

**A7 — `K_b` in `data/standards/components/water.dat:70-74`.**
Stored `K_b 0.512;` sits thirty lines below the three fields it is computed
from (`MW 18.015`, `Tb 373.15`, `HvapTb 40660`) in the *same record*.
`Component.cpp:381` states the rule in its own comment — *"K_b is a stored
derivative (R Tb² MW / HvapTb) and is not written in new files"*.

Derived: **0.51294**. Stored: **0.512**. Diverged by 0.19 %.

**It has a live reader**: `Evaporator.cpp:170` takes `solv.K_b()` and line 280
applies `T_boil = T_sat,pure(P_op) + K_b·m_solute`. So the divergence
propagates into a boiling-point elevation. Small, real, and the salt-enthalpy
shape exactly.

**A8 — the gas constant has four values in `src/`**: `8.314462618` ×9,
`8.314462` ×3, `8.314` ×3, `8.31446` ×2, against the declared
`Constants.H:47`.

## Where the architect's verification changed the fleet's answer

The audit ranked the gas constant **third** and `K_b` **last**. That ranking is
**inverted**, and the reason is the rule the audit was given and did not apply
to these two rows: *state the concrete wrong answer a user would get.*

- **A8 produces no wrong answer at any of its four sites.** The deviations are
  7e-8 to 6e-4 relative, and `Flowsheet.cpp:2052` — the worst-looking, `8.314`
  — is a **tolerance floor**, commented *"never divide by zero"*, where
  precision is irrelevant by construction. A8 is real as an arity violation and
  is hygiene, not correctness.
- **A7 does produce a wrong answer**, in a colligative boiling-point rise a
  student would read off an evaporator.

A finding's severity is the failure it causes, not the tidiness it offends.

## Not yet verified

The audit's `SUSPECTED` list (`docs/tutorials-catalogue.md` possibly
hand-maintained; `docs/ai/components.md`'s drift check possibly not running;
tallies inside `consolidation-map.md`; `check_ion_pins.py`'s hardcoded Wagman
enthalpies; two dated design records that may be historical snapshots rather
than live claims) is recorded unverified and is not acted on here.

## Actions

| id | action |
|---|---|
| **AR1** | Invert `DOC_COUNT_PAT`: flag digits near a corpus noun, require justification. Add `docs/engine-capabilities.md`, `paper/`, `site/*.html` and `.claude/skills/` to the scan. |
| **AR2** | Fix A1–A6 from the generator, not by hand. |
| **AR3** | `K_b` derives at load from `MW`/`Tb`/`HvapTb`; the stored key is refused where those exist. Golden change expected in the evaporator cases — expected, and to be reviewed rather than recorded blind. |
| **AR4** | Single-source the gas constant on `Constants.H`; retain the tolerance floor's literal only if it is re-commented as deliberately imprecise. |

**AR3 before AR4**: one changes an answer, the other tidies four spellings.
