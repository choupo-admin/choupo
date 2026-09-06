# Which line is a gate's claim — a fact with two homes, and a heading filed as a proof

*Slice 2026-09-06 (tasks #108 and #100).  Tooling plane — the manifest that
records what each gate checks.  Status: the rule has ONE home and is used by
`gate_manifest`; the shell side is wired at five sites of ~190 and the rest is a
named campaign.  Record level: 3.*

---

## 1. The defect

`generated/gateManifest.json` is the answer to *"what does this project
check?"*.  Its whole design — argued at length in
`bin/curate/gate_manifest.py`'s own header — is that a gate's claim is
**derived by running the gate**, never transcribed, because a transcription is
a second home for a derived fact and drifts.

The derivation had a second home anyway, one level down.  Not *what the claim
says* — **which line of the output the claim IS**:

* `gate_manifest.claim_of()` returned `line[0]`, the FIRST line.  Its own
  function docstring said *"first line of its output"*; the module docstring
  three screens above said `CAPTURED claim -- the OK line, verbatim`.  Two
  sentences in one file, describing two different rules, and the code
  implemented the one nobody would have chosen.
* `bin/runTests` captured a gate's PASS-row line by its own rule, chosen per
  call site.  Counted over the 201 `PASS` rows of the file as it stood on
  2026-09-06: **100 took `head -1`, 89 took `tail -1`, 3 took
  `grep -m1 ': OK'`**, 5 something else again, 4 a literal string.

So for every gate that prints detail BEFORE its verdict, the manifest recorded
a detail line as the gate's own account of itself, while the suite printed
something different in the same run, and nothing compared them.

Five were confirmed by running the gate and reading the committed entry beside
it.  Verbatim, before and after:

| gate | recorded as the gate's claim (before) | the line the gate actually marks (after) |
|---|---|---|
| `check_equipment_pinned` | `[excused: a sweep with no golden -- which point is the answer is RESERVED, task #77] tutorials/plant/sugarPlantEconomicsSweep` | `check_equipment_pinned: OK -- 230 equipment key(s) across 8 sizing case(s) are pinned in their goldens, in both directions … NOT CHECKED: whether any size or cost is RIGHT …` |
| `check_overlay_aad_pinned` | `[skipped, run-only tier] tutorials/plant/esterification2sector/sectors/REACTION` | `check_overlay_aad_pinned: OK -- 14 AAD statistic(s) across 3 overlay case(s) are pinned … NOT CHECKED: whether any AAD is GOOD …` |
| `check_groups` | `[check_groups] tree: /home/user/choupo/data/standards/components` | `[check_groups] OK -- every enforced compound declares its groups.  NOT ENFORCED … 91 record(s) carry reviewStatus interim …` |
| `check_ion_pins` | `NaOH   ions-solid =   -44.50 kJ/mol   anchor =   -44.51   OK` | `check_ion_pins: OK -- 3 dissolution anchor(s) (NaOH, NaCl, KCl) reproduce the aqueous ion tier to within 0.2 kJ/mol … NOT CHECKED: whether any ion hfAq or solid Hf is RIGHT …` (the gate had no claim line at all; this one was written) |
| `check_seal_drift` | `SEALED CATALOGUE DRIFT SUMMARY` | `check_seal_drift: OK -- 397 sealed manifest(s) and 3622 embedded record(s) inspected … NOT CHECKED: whether any sealed value is RIGHT …` (also written here) |

`check_equipment_pinned` is the one that shows why this is not tidiness: the
coverage record named **precisely the one case the gate had skipped**.  A
reader asking what that gate proves was told, with authority, the name of the
thing it does not cover.

`check_groups` shows the second shape: the recorded claim was a **path**.  Not
wrong, not right — an absolute path from whichever machine last regenerated
the file, filed under "what this gate checks".

## 2. The rule

**A gate's claim is the first line of its output that MARKS itself as the
claim:**

```
<label>: OK ...            or            [<label>] OK ...
```

at the start of the line (leading whitespace allowed), where `<label>` resolves
to the gate's own name — compared after lowercasing, mapping `-` and `.` to
`_`, and dropping a leading `check_` from both sides.

One home: **`bin/curate/gate_claim.py`**, importable (`claim_in(text, name)`)
and runnable (`gate_claim.py <gate-stem> <file>`), so the Python tool and the
shell harness read the same rule rather than each keeping their own.

Two properties are the point:

* **It is a MARK, not a POSITION.**  "First line" and "last line" are both
  guesses about where a gate happens to print its verdict; swapping one for the
  other only points the same guess the other way, and would have mis-read
  `check_groups` (whose claim is neither) just as confidently.  A mark is a
  statement by the gate about its own output, and it is checkable.
* **The label must answer to the gate.**  Requiring only the word `OK` would
  have promoted `check_ion_pins`' per-anchor row `NaOH  ions-solid = … OK` —
  which is exactly the line that was already being mis-filed.  Requiring the
  label lets `check_costing_refusals` mark its claim as `costing-refusals: OK`
  and `check_groups` as `[check_groups] OK`, which is how the corpus already
  writes them.

**The rule was chosen from a measurement, not from taste.**  Of the 191 gates
in `bin/curate/` on 2026-09-06, **139 already printed a correctly-labelled
claim mark and 52 did not** (measured by matching the rule against each gate's
source).  The convention existed; what was missing was anything that read it.

## 3. What refuses, and what does not

**A gate that marks no claim gets none.**  `claim_in` returns `None`;
`gate_manifest` records `"claim": null` rather than donating the gate's
heading, its first line or its last.  Picking a line out of prose and filing it
as "what this gate proves" is the defect, not the fix.

Three postures, deliberately different:

| situation | what happens |
|---|---|
| gate fails or times out | `gate_manifest` REFUSES TO WRITE, as since 2026-08-18 — a failure is the absence of a claim |
| `--only <gate>` names a gate that passes but marks none | REFUSES TO WRITE, naming the gate and the line it must print.  That arm exists to *refresh a claim*; writing a null over the reader's back, in an arm they invoked by name, would hide the one thing they should be told |
| full regeneration meets an unmarked gate | records `null`, and CENSUSES every such gate at the end with the remedy |

The full arm does not refuse, and that is a judgement rather than an oversight:
with 50 gates unmarked today, refusing would make the manifest **unregenerable**
until the campaign lands, and a file whose only purpose is to be true and
current cannot be locked shut for a month.  Recording `null` is the honest
statement of the same fact — *this gate marks no claim* — and it is louder than
the heading it replaces.

## 4. The campaign this slice STOPPED at

**50 gates mark no claim line** (191 total, 141 marked, after the two written
here).  That is not a handful, so they were not edited one by one; the count is
the finding and the decision is Vítor's.

| | | |
|---|---|---|
| `check_adsorption_tree` | `check_aq_disambiguation` | `check_aqueous_navigation` |
| `check_asset_homes` | `check_basis_rank` | `check_bjerrum_prose` |
| `check_both_bases` | `check_charge_balance` | `check_composite_limits` |
| `check_composite_reports` | `check_cosmo_scrub` | `check_ctrl_balance` |
| `check_doctrine` | `check_drill_in` | `check_duplicate_keys` |
| `check_element_balance` | `check_element_composition` | `check_empty_dirs` |
| `check_equilibrium_families` | `check_estimates` | `check_family_outliers` |
| `check_flash_complex` | `check_flash_model` | `check_git_visibility` |
| `check_h_surface` | `check_legacy_schema` | `check_lithium_routes` |
| `check_method_tools` | `check_models_catalogue` | `check_no_unit_chemistry` |
| `check_phase_speciation` | `check_record_form` | `check_registry_scan` |
| `check_resolver_coherence` | `check_retired_names` | `check_sealed_corpus` |
| `check_shortcut_column_refusals` | `check_solute_basis` | `check_species_identity` |
| `check_species_ontology` | `check_std_includes` | `check_stream_basis` |
| `check_stream_faces` | `check_temporal_utilities` | `check_tree_gate` |
| `check_two_liquids` | `check_type_coverage` | `check_typed_identifiers` |
| `check_unread_keys` | `check_v2_refusals` | |

**34 of the 50 already print a labelled summary line** — `duplicate-key gate:
every dict on disk declares each key once …` — and lack only the `OK` token
that says *this sentence is the claim*; the other 16 print a summary with no
label at all.  The work is small per gate and 50 gates wide, and it changes
what 50 gates print, which is why it is a decision and not a sed.

**This is also why the shell side is not fully wired.**  Routing all ~190
`bin/runTests` capture sites through `gate_claim.py` today would replace a
quarter of the suite's PASS-row text with the "no claim line marked"
placeholder — blanking rows that are currently informative, to suit a tool,
which is the move this project refuses on principle elsewhere.  The five sites
where the disagreement was CONFIRMED are wired (`seal-drift-gate`,
`overlay-aad-gate`, `equipment-pinned-gate`, `groups-gate`, `ion-pins-gate`)
through a `gate_claim()` shell helper that invokes the one home; the remaining
sites are, honestly, still a second home, and the comment at the helper says so
by name.  **C1 ended as one home in Python and one-and-a-half across the shell
boundary**, and that is stated rather than implied.

## 5. The #100 rule: a claim states its DOMAIN

Written down once, here, because it is the rule the five entries above were
judged against and it has had no home of its own:

> **A gate's claim states what was SCANNED and what was NOT.**  A verdict with
> no domain cannot be audited — "every compound declares its groups" is not
> checkable without knowing which compounds were looked at — and a domain with
> no stated limit reads as total coverage, which no gate here has.

Measured over the 191 recorded claims on 2026-09-06, with the definitions
stated so the count can be re-taken:

| | definition used | count |
|---|---|---|
| quantify their scan | the claim contains a number followed by a word (`\b\d[\d,]*\s+[A-Za-z]`) | **144** |
| state a limit | the claim contains one of `NOT CHECKED`, `NOT ENFORCED`, `UNCHECKED`, `does not check`, `does NOT`, `blind spot`, `cannot tell`, `not covered`, `does not prove`, `no claim` (case-insensitive) | **102** |
| neither | — | **29** |

The brief carried 144 / 102 / **30**; the third number recounts as 29 under the
definitions above, and a count is only as reproducible as its definition, which
is why they are printed here.

**And the census is itself contaminated by the defect this slice fixed** —
which is the finding worth keeping.  Two of the 29 that "state neither" are
`check_equipment_pinned` and `check_overlay_aad_pinned`, whose REAL claims
quantify their scan and state their limits in full.  They failed the domain
census because what was recorded for them was never their claim.  *A statistic
taken over a derived field inherits every defect of the derivation.*

The 29 are named rather than rewritten.  Rewriting 29 gates' prose is the same
campaign as §4 wearing a different hat.

## 6. What was deliberately NOT done

* **No new gate.**  A gate over the tool that reads gates needs its own
  decision (it would be a gate whose subject is the manifest, and the manifest
  is already the thing that records gates).  `gate_manifest --check` is
  unchanged and still compares NAMES only, which it states.
* **No blanket regeneration.**  Only the five entries were re-observed, with
  `--only`.  A full re-observation would silently refresh every OTHER entry's
  claim in the same commit, hiding exactly the drift the file exists to expose.
  The other 186 entries are as old as their last observation, and the file says
  so.
* **Nothing a gate CHECKS was changed.**  `check_ion_pins` and
  `check_seal_drift` gained a claim line and, in the first, two counters to
  state its scan; every arm, tolerance and refusal is byte-identical in intent.
  No gate's existing output line was reordered or removed — the excused and
  skipped case lines that the manifest used to mis-file are still printed,
  because they are information.

## 7. Doubts, stated

* **The label rule is a convention, and a gate could satisfy it dishonestly** —
  print `check_x: OK -- everything is fine` and the tool records it happily.
  This slice moves the question from *which line* to *what the line says*, and
  the second is a reading judgement no tool here claims.
* **The measurement in §2 (139/52) is a SOURCE measurement**, matching the rule
  against each gate's text, not against 191 live runs.  A gate that builds its
  claim string dynamically could be miscounted; none was found doing so (no
  gate's source contains an `f"{VAR}: OK"` form), but the check is over what
  the sources say, not over what they printed.
* **`check_seal_drift`'s new claim quotes `nManifests` = 397**, and counting
  the sealed manifests on disk today gives 397 files, of which **395 declare
  `catalogueRelease Choupo-2607`** and 2 declare `Choupo-2608`.  CLAUDE.md §2
  said *394*.  A hand-carried count of a growing corpus is the arity sin that
  file warns about in its own §6, so the number was removed from the sentence
  rather than incremented; the ruling it belongs to is untouched.
