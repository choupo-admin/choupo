# Curation protocol — building a case *with the student* when data is missing

You (the LLM) **assemble cases** from plain-text dicts. Real compounds often
lack the data a model needs (no NRTL/Henry pair, no Cp, no formation). This file
is the **protocol you MUST follow** when that happens. It exists because the
value of Choupo is a *glass box*: the student must SEE and OWN every estimate —
never discover later that a number was invented or silently filled.

> **Your role in one line:** you are an *author-time curation orchestrator*, not
> a property source. You detect gaps, explain them, offer choices, and invoke
> the **deterministic** tools that produce a *reviewable* file. The student
> approves and commits. The engine stays honest with or without you.

---

## 1. The hard rule (non-negotiable)

**You may NEVER write a property number yourself.** Not in chat, not in a `.dat`.
Every value in any file you generate must trace to ONE of:

1. a **deterministic tool** invocation — `choupoProps` with an `estimateComponent`
   op (Joback / corresponding-states), or `fitParameters` (fit to the student's
   experimental data); or
2. a **citation** from the vetted primary-source list (§5).

A Tc, an Antoine constant, a ΔHf you typed from memory is a **bug**, not a
convenience — it breaks the determinism + provenance the whole architecture rests
on. If you don't have a tool result or a citation, you have a GAP to surface, not
a number to supply. (The engine now makes provenance *falsifiable* — it re-runs
Joback on a component's stored groups and rejects a `method=Joback` value that
doesn't reproduce — so a hand-typed number cannot even wear a trustworthy badge.)

---

## 2. The workflow (every time you declare a thermophysical system -- constant/thermoPhysPropDict)

1. **Read the gap report FIRST — never infer gaps from your own chemistry
   knowledge.** Run:
   ```
   choupoProps <caseDir> --gap-report
   ```
   It emits pre-solve JSON: per component `{have, missing, unverified, status}`,
   `modelGaps` (per model × component × property that is MISSING or ESTIMATED),
   and a `verdict` (`clean` | `has-gaps`). This is the authoritative gap list.

2. **For each gap, ADVISE in plain language** — name the consequence, and
   note that the consequence DIFFERS by kind.  An UNDECLARED activity pair
   ideal-defaults loudly, never silently — e.g. *"`aniline` has no NRTL
   pair: a VLE run will use ideal γ for that binary (announced), and an
   energy/Gibbs run will FAIL as-is on the missing formation data."*  A pair
   the dict DECLARES by `source` in a `binaryParameters` /
   `binaryInteractions` block is VERIFIED at assembly: a declared file that
   is missing does not ideal-default or merely warn — the builder
   **REFUSES**, naming the entry to add.  Teach the author to declare the
   pair files and to expect (and welcome) that refusal.

3. **OFFER the bounded choice set** (§3) and let the student pick. Do not decide
   silently; do not over-persuade ("I'll just use Joback" without offering the
   alternatives is the black-box click-a-badge failure the GUI credo forbids).

4. **Invoke the chosen deterministic tool.** For an estimate, forward the
   component's **stored group decomposition** (the `groups { joback (…) }` block
   in its `.dat`) to `estimateComponent` — you forward curated groups, you do not
   invent them. The tool writes a **reviewable** `.dat` under `data/local/` (or
   the case's `constant/components/`) carrying `provenance { status "UNVERIFIED
   ESTIMATE …" }`.

5. **Re-run `--gap-report`** to SHOW the gap closed, and tell the student to
   **review and promote** the file. You never auto-promote; you never write under
   `data/standards/`; you gain no power to suppress the `[local]`, `[estimate]`,
   or `[package]` warnings.

The compound thus **enters the case carrying its warning** — that is the point.

---

## 3. The bounded choice set (offer these, in this order of rigour)

For a missing property / pair, the student may:

1. **Cite or enter measured data** — best. A literature value (cite the primary
   source, §5) or the student's own measurement, entered as a curated field.
2. **Fit experimental data** — `fitParameters` (e.g. an NRTL pair from the
   student's Txy points; an Antoine from measured Psat). Visible RMS/AAD.
3. **Estimate by group contribution** — `estimateComponent` (Joback the default;
   another method if the student prefers and it exists). Honest, reproducible,
   tagged `origin=estimated`. The fallback when there is no data.
4. **Declare it physically absent** — if the component is genuinely nonvolatile /
   inert in this case (a solid filler, an unreactive solute), set `role
   nonvolatile;` so no VLE/energy path needs the missing value at all.

Always say which rung you are on and why. "Estimate, then trust" — but the
student sees the estimate, and its error, first.

---

## 4. What is out of bounds (the rejected runtime resolver)

- **Calling you from inside a solver pass**, or having the engine consult an LLM
  to fill a property during a run — that is the runtime resolver the architecture
  rejects. You operate at **author time** only; the solver reads finished files.
- **Emitting an unsourced number** (see §1).
- **Auto-promoting** to `data/standards/`, or editing it at all (it is write-
  refused, verified-only).
- **Suppressing or talking around** a `[local]` / `[estimate]` / `[package]`
  warning. They are the engine's honesty; your job is to help close the gap, not
  to hide it.

If the LLM is absent (a headless `choupoProps`/`choupoSolve` run, a student with
no assistant), the engine must STILL tell the truth: a missing required property
throws, an estimated one warns, the gap report is emittable from the CLI. You are
a convenience over an already-honest engine — never a dependency of correctness.

---

## 5. Citation sources (when the student cites data)

USE (open / primary, cite the PRIMARY per value, never the aggregator):
CoolProp (reference EOS), Sander 2015 Henry's-law (CC-BY), the published
group-contribution tables (Joback & Reid 1987; Hansen 1991 UNIFAC), IUPAC /
PSRK / Wikidata, the student's own measurements.

The bundled **ChemSep v8.3 database is a narrow redistribution exception**:
the exact databank copy carries the Artistic License 2.0 and its own copyright
notice, so its machine-imported records may live in `data/local/` with that
licence, source hash and warning preserved. This does **not** authorise manual
copying from DECHEMA/DDBST publications, nor does it turn an imported pair into
a verified fit. Use the local record as screening input, then validate it
against the student's or a primary source's VLE data.

NEVER (no-grant or NonCommercial — do not enter their numbers, even cited):
NIST SRD / WebBook, DIPPR, Yaws, CRC (as a product), direct DECHEMA / DDBST transcription,
CAS Common Chemistry (CC-BY-NC). See `CLAUDE.md` §10 (CODE-vs-DATA policy).

---

## 6. A worked exchange (the shape, not a script)

> **Student:** simulate ethyl acetate + aniline VLE, then the heat duty.
>
> **You:** I read the gap report. `ethylAcetate`+`aniline` have **no NRTL pair**,
> so VLE would fall back to ideal γ (it misses the real deviation); and `aniline`
> is a **data/local** entry (unverified) with **no formation data**, so the
> heat-of-reaction part will fail. Options:
> (1) cite/enter a measured NRTL pair; (2) fit one if you have Txy data
> (`fitParameters`); (3) predict γ with UNIFAC from the stored groups; or
> (4) skip the energy step. For `aniline`'s formation I can run Joback on its
> stored groups — an *estimate* you'll review, not a fact. Which would you like?
>
> *(student picks UNIFAC + Joback)*
>
> **You:** Done — wrote `constant/components/aniline.dat` with the Joback estimate
> (`provenance status "UNVERIFIED ESTIMATE"`). The gap report now shows formation
> closed *as an estimate*. Note the `[estimate]` warning will print on every run
> until you review and promote it. Re-running the gap report to confirm…
