# `parameters/henry/` — Henry's-law constant records

PRIVATE tier (`data/tmp/`, gitignored). Created **2026-07-24** by
`agent:henry` (phase 4). Envelope + ARITY rule:
[`../../RECORD_SPEC.md`](../../RECORD_SPEC.md).

## Why this family exists

A Henry's-law constant is the partition of a **given chemical form** of a
solute between the gas phase and a **named solvent** at a stated temperature —
**arity 2** (`solute` + `water`), a SYSTEM property. It is therefore not an
intrinsic component field, and per `RECORD_SPEC.md` ("zero usable science may
live only in a comment") it may not survive as a comment line inside
`components/*.candidate.dat` either.

Phase 3 correctly **deleted** two such values from `PFOA.candidate.dat` and
`PFBA.candidate.dat` and parked them, verbatim with their citations, in
[`../../components/_CLEANUP_hormones_pfas_volatiles.md`](../../components/_CLEANUP_hormones_pfas_volatiles.md)
section 2, "removed from a component, and NO HOME EXISTS YET". **This directory
is that home.** The component files were **not modified** by this pass — they
already carry the correct pointer comment ("do not re-add").

Before creating the directory the whole staging tree was swept for further
Henry-shaped values (`henry`, `Pa.m3/mol`, `atm.m3/mol`): **there are exactly
two**, the ones below. No other family had one hiding in a comment.

## Records emitted — 2

| # | solute | solvent | H (Pa·m³/mol) | T | source | status |
|---|---|---|---|---|---|---|
| 1 | PFOA | water | 0.362 | 298.15 K **assumed** | ATSDR (2021) Table 4-2 | `flagged` |
| 2 | PFBA | water | 1.24 | 298.15 K **assumed** | ATSDR (2021) Table 4-2 | `flagged` |

Both were transcribed digit-for-digit from the cleanup ledger, which itself
matches `../../pfas_volatiles_SOURCES.md` lines 28 and 59. Nothing was
converted, averaged, reconciled or invented.

### Why `flagged` and not `candidate` — and NOT for a legal reason

ATSDR Toxicological Profiles are **US federal government work, public domain**:
`licence "public domain (US Government, ATSDR/CDC)"`. These two values are among
the legally cleanest in the whole staging tree — they do **not** appear in
`../../_LEGAL_SWEEP.md`. They are `flagged` on **physics and completeness**:

1. **The temperature is not sourced.** ATSDR Table 4-2 does not restate a
   temperature for the Henry column. The conventional 298.15 K is applied and
   annotated as an assumption, exactly as the `partition/` family did for its
   34 records. A Henry constant typically changes by a factor of ~2 over 20 K,
   so this is the dominant uncertainty, not a footnote.
2. **The chemical form is wrong for the intended use.** Both are constants for
   the **neutral acid**. PFOA's own pKa determinations span more than three log
   units (−0.5 / 1.30 / 2.80) and PFBA's is a class bound ("< 1.6"); at any
   process pH the **anion** dominates and the effective air-water partitioning
   is orders of magnitude lower. PFOA is additionally an interfacially active
   surfactant that accumulates *at* the air-water interface rather than
   partitioning through it — the same objection that made its `logKow` record
   `flagged`.
3. **No primary is pinned.** ATSDR consolidates primaries but names none for
   this entry.

### The basis conversion is shown, not hidden

The engine's Henry family (`data/standards/parameters/Henry/<solute>-water.dat`)
is parameterised on the **pressure / mole-fraction basis**, `H_ref [Pa]`, via a
van't Hoff form. The staged values are on the **concentration basis**,
`Pa·m³/mol`. The two differ by the molar density of the solvent, so each record
carries a `derived {}` block that states the equation, the water density and
molar mass used, and the resulting `H_xp` — marked `origin derived`,
"PROVISIONAL … not a second independent datum". This mirrors the Stokes-radius
convention in `parameters/transport/diffusion/`.

### What was deliberately NOT done

| act | why not |
|---|---|
| fit a van't Hoff `enthalpy` | one temperature (and an assumed one) cannot yield a temperature dependence; that would manufacture a correlation, the same trap the PFBA Clausius-Clapeyron note refuses |
| promote to `data/standards/parameters/Henry/` | the engine's form needs `H_ref` **and** `enthalpy`; neither record can supply the second, and the source temperature is unpinned |
| emit a record for PFOS or PFBS | no Henry constant is staged for either — ATSDR reports no free-acid data (both are salt-dominated in the literature). No empty records |
| back-calculate H from vapour pressure ÷ solubility | for PFOA that would combine an **extrapolated** vapour-pressure point with a solubility whose form is disputed; for PFBA the "solubility" is a liquid-liquid mutual solubility, not an SLE. Both would be derived numbers dressed as measurements |

## Route to `candidate`

1. Pin the primary behind the ATSDR Table 4-2 Henry column (the profile's own
   reference list) — this also usually restores the measurement temperature.
2. Obtain a second temperature so `dissolutionEnthalpy` becomes fittable.
3. Decide, at case level, whether the neutral-acid constant is the quantity
   wanted at all, or whether an effective, pH-dependent constant is (in which
   case the record stays as the neutral-form anchor and the pH correction is
   computed from the pKa record — never stored as a second Henry value).
