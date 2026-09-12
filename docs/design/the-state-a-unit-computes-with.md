# The state a unit computes with is not the state its streams carry

**2026-09-12.**  Diagnosis and fix of `column01_benzene_toluene`'s 631.956148 kW
(24.68 %) plant-boundary first-law residual, and of the twelve other cases that
turned out to carry the same family of defect.

Every number below was produced by a command, and the command is named.  The
engine measured is the one built from this commit's source unless stated.

---

## 1. What was wrong, in one sentence

A distillation column's feed had **two homes for its thermal state**, and its
duty block **priced states the unit does not publish**.  Neither is a thermo
defect: both sides of every arithmetic here were already on
`H_stream_formation`, the canonical elements datum.  What disagreed was *which
state* each side was pricing.

---

## 2. The hypothesis that was tested and killed first

The constitution filed `column01` under *"a unit solves its energy equation on
one enthalpy surface while its streams are priced on another"* — the family
that covered the ε-NTU exchanger and the adiabatic `gibbsReactor`.  A second
hypothesis was raised during the investigation and is the more interesting one:
that the residual is **the content of the declared model** — Wang-Henke assumes
constant molar overflow, CMO replaces the stage energy balance with a molar
one, so a column solved that way does not conserve enthalpy and the 24.68 % is
the honest price of the assumption.

It is not.  `column01` was run under every model word the unit accepts:

| `model` | residual kW | `Q_reboiler_kW` |
|---|---:|---:|
| *(default)* `WangHenke` | 631.956148 | 1279.30480005 |
| `simultaneous` | 631.956246 | 1279.30484921 |
| **`fullMESH`** (drops CMO) | **632.127272** | 1279.43961411 |
| `MESH` | 632.127272 | 1279.43961411 |
| `NaphtaliSandholm` | 632.127272 | 1279.43961411 |

Dropping CMO moves the residual by **0.171 kW — 0.027 % of it — and away from
zero.**  There is also a structural reason it could never have been CMO:
`Q_reboiler_kW = dH − Q_cond` is a **plug**, computed by closing the column's
own overall enthalpy balance.  Whatever CMO does to the internal V/L profile,
the reported duty is by construction whatever makes the column close, so a CMO
column cannot emit a boundary residual at all.  The residual can only come from
the two sides pricing *different states*.

For the record, since it was checked while testing this: `fullMESH`, `MESH` and
`NaphtaliSandholm` all take the energy-consistent branch, identically — the
Theory Guide's table (`docs/theoryGuide.tex`) already says so, and only
`simultaneous` stays on CMO.

What CMO actually costs on this column is worth a student's attention and is
small for a good reason: benzene and toluene have nearly equal latent heats,
which is the condition under which CMO is taught to be valid.  Measured,
`Q_reboiler_kW` 1279.30480 (CMO) against 1279.43961 (full MESH) — 0.135 kW,
0.011 %.

---

## 3. The decomposition, and it is exact

With `residual = H_feeds + Q_boundary − H_products` and `Q_boundary = dH_column`,

```
residual = (H_report(feed)  − H_column(feed))
         + (H_column(dist)  − H_report(dist))
         + (H_column(bot)   − H_report(bot))
```

An instrumented build printed the column's three terms; the report's three come
from the run's own JSON:

```
[PROBE] Hcol_D(T=354.21089412)=781.537322935  Hcol_B(T=382.893530951)=365.403742938
        Hcol_F(T=370,vf=0)=1148.67974585      Hcol_D_at_pub(T=353.630069529)=780.441782022
report  feed 1779.54082551   distillate 780.441782022   bottoms 365.403742938
```

| term | kW | what it is |
|---|---:|---|
| **D1** feed thermal state | **+630.861080** | column priced a saturated liquid; the stream is 69.7 % vapour |
| **D2** distillate temperature | **+1.095541** | duty priced the top-tray T; the stream is published at its bubble point |
| **D3′** report's re-flash whisker | **−0.000473** | report re-flashed a bubble-point stream, found V/F = 1e-6, priced a vapour sliver |
| **total** | **631.956148** | the engine's own `residual` = **631.956148** |

A fourth defect, **D3**, was *latent*: invisible while the column priced its
feed as single-phase, and worth **5.509232 kW** the moment D1 was fixed.

### D1 — the feed's thermal state had two homes

```
0/feed         T 370 K;  vaporFraction 0.6972418857;   (=> q = 0.3028)
flowsheetDict  feedQuality 1.0;                        (=> saturated liquid)
```

The engine's own `flash` unit at 370 K, 1.01325 bar returns **V/F = 0.697242**.
The stream was right; `feedQuality 1.0` was simply false.
`DistillationColumn.cpp` read the dict at two sites, `:402` (Wang-Henke, the
corpus default) and `:1178` (the `simultaneous` *legacy single-feed* branch);
`reporting/BalanceMath.H` read the stream.

Proof it was causal: setting the stream's `vaporFraction` to `0.0` and changing
nothing else dropped the residual **631.956148 → 1.095068 kW** with
`converged/distillate` and `converged/bottoms` **byte-identical**.  The
Wang-Henke path never read the stream's `vf` at all.

The right rule was already in the same file, on the other branch: `:1156-1169`
derives `qf = 1 − vfStream` and refuses a `quality` that disagrees, in a message
that names this exact bug class.

### D2 — the duty priced a distillate the unit does not publish

`makeDistillate` publishes the distillate at its **bubble point**
(353.630069529 K).  Both duty blocks priced it at **`T[0]`** (354.21089412 K),
the top-tray dew temperature.  Measured three independent ways, all agreeing at
**1.095541 kW**: the instrumented build; a one-line patch (residual
631.956148 → 630.860607); and two probe cases pricing the same composition at
the two temperatures through the report's own path.

Because `Q_reb = dH − Q_cond`, this inflated the reported reboiler duty on every
non-reactive column in the corpus.

### D3 — a two-phase feed priced on a quality blend

`ThermoPackage::H_stream_formation(T, P, vf, z)` returns
`(1−vf)·H_liquid_formation(T, z) + vf·H_real(T, P, z)` — **both legs at the
overall composition `z`**.  That is a quality blend: exact for a pure fluid, and
for a mixture not the enthalpy of the two-phase state, whose phases have
different compositions.  The report never used it for a two-phase stream
(`streamSplit` → `hOfState`, at the equilibrium `x` and `y`); the column always
did.  With `feedQuality` corrected to 0.3027581143 the instrumented build gives
`Hcol_F = 1785.05005728` against the report's `1779.54082551` — **5.509232 kW**.

### D3′ — and the report had a whisker of its own

An unpinned stream sitting exactly at its bubble point re-flashes to
V/F ≈ 1e-6 — numerical zero, but above the 1e-9 threshold that decides
"two-phase" — so the report priced a vapour sliver the column never made.  After
every other defect was fixed this was the whole of what remained: **3.4107 W**
on `column15` against a residual of 0.003411 kW, **1.6957 W** on `column14`
against 0.001696 kW.

---

## 4. What was changed

**R1 — the feed's thermal state is resolved from the stream, once.**
`resolveFeedThermalState` in `DistillationColumn.cpp` calls
`flashState::twoPhaseSplit`, the *same* call `reporting/BalanceMath.H` makes, so
the state the column computes with and the state the balance prices are one
object rather than two conventions.  `feedQuality` survives as a **cross-check
only**: agreeing, it is silent; disagreeing, it refuses.

**RESOLVE, not read the declared field** — and that distinction is the whole of
two more cases.  `stripper01_sour_water` and `stripper02_sour_water_h2s` declare
no `vaporFraction` at all, say `feedQuality 1.0`, and resolve two-phase: nothing
in their text contradicted anything, and their residuals —
**12.794585 kW (10.4 %)** and **17.480393 kW (13.6 %)** — were the *whole* of
each plant's first law.  A rule reading only the declared field would have
passed both and looked complete.

**R2 — the duty prices the distillate at the temperature it is published at**,
both sites, reading `dStream.T` rather than recomputing a second bubble point.

**R3 — the duty prices a two-phase feed at the equilibrium compositions**,
through `feedEnthalpy`, by `BalanceMath`'s own rule.  Taken by the **narrow**
route (fix the column), not the wide one (change `H_stream_formation` itself) —
see §7.

**R4 — a total condenser and a partial reboiler declare their outlet's phase.**
`makeDistillate` sets `phasePinned` on the bubble-point route only (the two
fallback routes publish the top tray's temperature and say they do; pinning a
state we have just called wrong would convert an announced approximation into a
declaration), and both paths pin the bottoms.

**One home moved up a band.**  "A converged single-phase resolution is not a
split" lived in `reporting/BalanceMath.H`, and `unitOperations` may not include
`reporting`.  It is now `flashState::twoPhaseSplit` in
`unitOperations/flash/StreamEquilibrium.H`, called by both — one sentence with
two readers, not two sentences that agree today.

**The feed dict carries `streamName`** (`Flowsheet.cpp`), read only to write
messages: the unit dict drops `in` when it is composed, so a refusal could not
otherwise say *which* feed.

---

## 5. What it bought, measured

Every distillation-bearing case, engine's own `globalEnergyBoundary`:

| case | before kW | after kW |
|---|---:|---:|
| `column01_benzene_toluene` | 631.956148 | **0.000000** |
| `column09` · `column10` · `column16` | 631.956148 | 0.000000 |
| `column11_murphree` | 632.525834 | 0.000000 |
| `heatlink01_condenser_to_heater` | 631.956148 | 0.000000 |
| `optim01_column_reflux` | 631.455863 | 0.000000 |
| `stripper01_sour_water` | 12.794585 | **0.000000** |
| `stripper02_sour_water_h2s` | 17.480393 | **0.000000** |
| `column12_stage_is_a_flash` | 7.571583 | −0.000008 |
| `column14_klemola_c4_splitter` | 8.616625 | 0.000000 |
| `column15_klemola_ideal_trays` | 7.840882 | 0.000000 |
| `column02` · `column03` · `column06` · `column07` | 0.035–1.24 | 0.000000 |
| `heatlink02` | 1.486788 | 0.000000 |
| `process05_isomerization_recycle` | 0.134789 | 0.000000 |
| `acetonePlant` | 41.720647 | 6.573464 |

Nine entries left `check_energy_closure`'s `KNOWN_OPEN`.  The gate now reports
68 cases closing within its band, against 57 before.

---

## 6. What was NOT fixed, and it is named rather than implied

* **`column04_multifeed_sidedraw` (−78.693876 kW)** and
  **`column08_radfrac_multidraw` (−891.980060 kW)** are **undiagnosed**.  D2+D3
  account for 1.645 kW and 2.145 kW of them; the rest is something else.  Both
  are multi-feed with side draws.  They stay pinned in `KNOWN_OPEN_KW`.
* **The `simultaneous` MULTI-feed branch** reads each feed's *declared* `vf` and
  refuses a contradicting `quality`, but neither resolves an unpinned feed nor
  prices a two-phase one at `(x, y)`.  Not live on today's corpus — every
  multi-feed case declares single-phase feeds — and deliberately not fixed
  blind, because the two cases it would move are the two above.
* **`column05_reactive_methylacetate` (0.163790 kW)**: on the reactive path
  `makeDistillate` publishes the top tray's temperature and says so, so D2 is 0
  there by design and this residual is a different question.
* **The wide route for D3.**  `H_stream_formation`'s own two-phase branch is a
  quality blend at `z` for every caller in the engine, not only this one.
  Making it flash would be the true one-home fix and its blast radius has not
  been measured; it is recorded here as the deferred option, not taken.
* **Whether a declared feed state is TRUE of the feed.**  The strippers now
  declare `vaporFraction 0.0` and their own equilibrium at 360 K is not
  single-phase.  That is a pin the engine honours (R-E2) and a physics question
  about those cases, flagged for the maintainer rather than decided here.

---

## 7. Two judgement calls, and why

**The refusal names the edit, not only the rule.**  Eleven shipped tutorials
reached a converged answer through this contradiction, so the first people to
meet this message will be holding cases of their own, cold, mid-term.  A message
that says *"a feed's thermal state lives in the stream"* and stops is the shape
invariant I5 exists to stop: it teaches unease.  So the refusal quotes both
numbers, offers both edits with their values filled in, and says which one is
recommended and why.  The cost is a long message; the alternative is a bug
report.

**The eleven were fixed by DELETING the key; the two strippers by DECLARING the
state.**  These look inconsistent and are not.  The eleven explicitly authored
`vaporFraction 0.6972418857`, which the engine's own flash reproduces to six
figures — the author plainly meant a two-phase feed, so the stream rules and the
dict key goes.  The strippers declared nothing; `feedQuality 1.0` was the only
statement their author ever made about the phase, so the honest reading is that
they meant a liquid, and that is written into the stream where it belongs.  In
both cases the case now says **one** thing.

---

## 8. Gate

`bin/curate/check_feed_thermal_state.py`, wired into `bin/runTests`.  Seven
arms: the refusal fires and names both numbers and both remedies (a); the
negative — no `feedQuality`, it runs (b); the second negative — an agreeing
`feedQuality` runs and is silent (c); the **resolved-state** arm (d); the second
home stays deleted (e, source); neither duty site prices at `T[0]` (f, source,
**counting** not detecting); and the flagship's own first law closes at or below
1e-6 kW, read from the engine's report (g).

The fixture is written by the gate, not borrowed from a shipped case: a gate
that fires a refusal must own the case that provokes it, or the day somebody
fixes the shipped case the gate quietly stops testing anything.

### Sabotages

Nine, each applied to the tree, **the file read back off disk to confirm the
edit landed**, the engine rebuilt, the gate run, then reverted.

| # | sabotage | verdict | arms that fired |
|---|---|---|---|
| S1 | remove the refusal call (Wang-Henke) | CAUGHT | a, d |
| S2 | **narrow the rule to the DECLARED field** | CAUGHT | **d**, g |
| S3 | drop the delete-the-key remedy from the message | CAUGHT | a |
| S4 | restore the defaulted second home | CAUGHT | e |
| S5 | revert R2 in the Wang-Henke duty | CAUGHT | f, g |
| S6 | revert R2 in the SIMULTANEOUS duty only | CAUGHT | **f** |
| S7 | revert R3 (price the feed on the quality blend) | CAUGHT | g |
| S8 | revert R4 (unpin the distillate) | CAUGHT | g |
| S9 | refuse an AGREEING feedQuality | CAUGHT | c |

None survived.  Two are worth reading twice.

**S2 is the discriminating sabotage and arm (a) PASSED under it.**  Narrowing
the rule to compare `feedQuality` against the declared `vaporFraction` field
still catches the visible contradiction — so the gate would have looked healthy
while `stripper01` and `stripper02` stayed broken.  Only arm (d), whose fixture
declares no vapour fraction at all, tells the two rules apart.  *A gate can pass
every arm but one and still be describing a different rule from the one that is
running.*

**S6 fired arm (f) alone**, because arm (g) runs a Wang-Henke case and cannot
see the simultaneous site.  This is why (f) counts occurrences rather than
detecting one: a presence test is satisfied by whichever site is still correct.

**And the gate found a defect in its own fix.**  Arm (e) failed on the first
run against a *third* reader nobody had named: `solveForRecovery` read
`feedQuality` with a default and printed it in the `[recovery]` banner as
`q = ...` — a number the column no longer used.  That is the 2026-08-04
speciation-banner trap exactly: *a banner keyed on one model and defaulting for
the rest describes a model that is not running.*  It now resolves the state and
prints that, and cross-checks the key where the case's own dict lives, so a
contradiction is refused up front instead of dozens of MESH solves later.
