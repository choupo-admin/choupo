/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  bjerrumSweep — the species-distribution lens's pH grid, its family registry,
  and the reshaping of the engine's per-point output into one wide table.

  ZERO PHYSICS.  Every number that reaches the chart is written by the engine:
  each point of the sweep is one `speciate` operation (the op the corpus
  already runs — tutorials/props/electrolyte/rainwater_air and friends), and
  what happens here is a LONG -> WIDE reshape of the species tables it wrote,
  plus a read of what the run PRINTED.  Nothing in this file computes an
  equilibrium, an activity coefficient, a pH, or a fraction: not even a
  normalisation, because "which species belong to this acid family" is
  stoichiometry, and a second copy of the stoichiometry here would be a second
  home for the bridge the chemistry records already declare.  The bands are the
  molalities the engine published, on the log axis they physically want.

  WHAT THE FAMILY REGISTRY DECLARES, and what it deliberately does not.  It
  declares the two things a case would have to WRITE to reach the family -- the
  MASTER ion of `totals {}`, and (as an editable default, with the salt named
  on screen) the counter-ion that makes the feed neutral.  It does NOT list the
  family's members: the network closure decides those from the curated
  data/standards/chemistry/ records, announces what it activated and what it
  could not reach, and the band set is read back out of the engine's own CSVs
  (the union of species names, in first-appearance order).  A family that gains
  a species the day a record is curated gains a band here with nobody editing
  this file.

  THE CHARGE RESIDUAL IS READ, NOT COMPUTED (and this is a stated engine gap).
  `SpeciationSolver` computes `chargeResidual = sum z_i m_i / sum |z_i| m_i`
  over the answer's own rows and PRINTS it, saying in its own words which of
  the two meanings it carries -- "(pH GIVEN -- this is the net charge the
  analysis carries)" or "(electroneutrality IMPOSED -- this is the residual of
  the row)".  `Speciate::run` copies `I`, `aw` and `pH` into the operation
  diagnostics and does NOT copy this one, so the number reaches no
  machine-readable surface at all: not the CSV, not the result JSON.  Until it
  does, this module lifts it off the log the way ExploreWorkspace already lifts
  advisories, and `parseChargeResiduals` returns null for any point whose line
  it could not find -- so a partial read is VISIBLE as a missing column rather
  than silently plotted as zero.

  THE ZERO CROSSING IS THE TWO CLOSURES MEETING, and it was CHECKED against the
  engine rather than asserted.  2 mmol/kg HCO3 + 2 mmol/kg Na at 25 C, swept
  with the pH imposed, gives q = +0.000687 at pH 8.25 and q = -0.0059 at
  pH 8.50, so the titrant vanishes at pH 8.276.  The SAME feed under `pH solve;`
  reports "speciation: SOLVED pH = 8.277 (from electroneutrality)".  They agree
  because they are the same statement: where no titrant is needed, the imposed
  pH IS the pH electroneutrality would have found.  (choupoProps, Choupo-dev
  commit 60623158, 2026-08-19.)
\*---------------------------------------------------------------------------*/

/** An acid/base family the lens can draw, named by the MASTER ion a case
 *  declares in `totals {}` to reach it.  `gas` (optional) is the gas-liquid
 *  catalogue entry that can pin the family from an OPEN atmosphere. */
export interface BjerrumFamily {
  id: string;
  /** Menu label. */
  label: string;
  /** The master ion written into `totals {}` (a curated species name). */
  master: string;
  /** Default total for that master [mol/kg water]. */
  total: number;
  /** Gas that pins this family through Henry's law, when the atmosphere is
   *  opened (`atmosphere { <gas> <p> atm; }`).  Absent = closed system only. */
  gas?: string;
  /** The COUNTER-ION the family's usual salt brings, and how many of it per
   *  master ion.  It is a second `totals {}` entry, nothing more — the same
   *  line an authored case would carry.
   *
   *  WHY IT IS OFFERED AT ALL, and why the number is the READER's.  A master
   *  ion declared alone is a bare charge: 2 mmol/kg of HCO3 with no cation can
   *  never be neutral, so the net charge of the answer sits at one whole
   *  equivalent everywhere and the titrant curve is a flat line that teaches
   *  nothing.  Declare the sodium that a bicarbonate solution actually
   *  contains and the curve CROSSES ZERO — and the pH where it crosses is
   *  exactly the pH that `pH solve;` would have returned for that feed, which
   *  is the two closures of the same network meeting on one picture.
   *
   *  `perMaster` and `salt` are a DEFAULT the reader can edit, shown in the
   *  panel with the salt named so the claim is visible.  They are not read as
   *  stoichiometry by anything: the engine receives only the two molalities,
   *  and a reader who disagrees types another number.  (The tree cannot supply
   *  this: `components/NaHCO3.dat` carries no `dissociatesTo`, so the engine's
   *  own `composition {}` expansion — which WOULD derive it and verify the
   *  charge — refuses on every one of these salts.) */
  counter?: { species: string; perMaster: number; salt: string };
  /** What the curated network is expected to reach — a sentence for the reader,
   *  never a list the code consumes (the engine decides and announces). */
  note: string;
}

/** The families, each backed by curated records in data/standards/chemistry/.
 *  Verified by running `speciate` on each master (2026-08-19).
 *
 *  DELIBERATELY ABSENT: tartrate.  Its two records (H2Tart-formation,
 *  HTart-formation) are algebraic inverses written from DIFFERENT masters, so a
 *  feed declared on `Tart` reaches H2Tart and reports HTart unreachable — a
 *  diprotic acid drawn without its intermediate.  The engine says so in its
 *  closure line; a lens that offered the family would still be inviting a
 *  reader to look at a diagram with a band missing from the middle. */
export const BJERRUM_FAMILIES: BjerrumFamily[] = [
  { id: "carbonate", label: "carbonate (CO₂ / HCO₃⁻ / CO₃²⁻)", master: "HCO3",
    total: 2.0e-3, gas: "CO2",
    counter: { species: "Na", perMaster: 1, salt: "NaHCO₃" },
    note: "the classical Bjerrum system; open it to the atmosphere and the "
        + "total carbonate stops being an input" },
  { id: "ammonia", label: "ammonia (NH₄⁺ / NH₃)", master: "NH4",
    total: 2.0e-3, gas: "NH3",
    counter: { species: "Cl", perMaster: 1, salt: "NH₄Cl" },
    note: "the sour-water base; one crossing, at the pKa" },
  { id: "phosphate", label: "phosphate (H₃PO₄ / H₂PO₄⁻ / HPO₄²⁻ / PO₄³⁻)", master: "PO4",
    total: 2.0e-3,
    counter: { species: "Na", perMaster: 3, salt: "Na₃PO₄" },
    note: "triprotic — three crossings, and the buffer plateaux between them" },
  { id: "sulfide", label: "sulfide (H₂S / HS⁻)", master: "HS",
    total: 2.0e-3, gas: "H2S",
    counter: { species: "Na", perMaster: 1, salt: "NaHS" },
    note: "the other sour-water family" },
  { id: "acetate", label: "acetate (CH₃COOH / CH₃COO⁻)", master: "Acetate",
    total: 2.0e-3,
    counter: { species: "Na", perMaster: 1, salt: "CH₃COONa" },
    note: "the textbook weak acid, pKa 4.756" },
];

export const familyById = (id: string): BjerrumFamily =>
  BJERRUM_FAMILIES.find((f) => f.id === id) ?? BJERRUM_FAMILIES[0]!;

/** The pH grid.  ONE home, shared by the dict synthesizer (which writes a
 *  `speciate` op per value) and the merge (which labels the rows with them) —
 *  two independently-built grids would agree until somebody changed one. */
export function bjerrumPhGrid(from: number, to: number, n: number): number[] {
  const count = Math.max(2, Math.round(n));
  const out: number[] = [];
  for (let i = 0; i < count; ++i)
    out.push(from + ((to - from) * i) / (count - 1));
  return out;
}

/** The output file the i-th point's `speciate` op writes.  Each op needs its
 *  own file (they would otherwise overwrite one another), and the worker
 *  harvests every *.csv under the case root.  The index is GLOBAL across the
 *  sweep, so a chunked run's files never collide. */
export const bjerrumOutput = (i: number) =>
  `bjerrum-${String(i).padStart(3, "0")}.csv`;

/** Split the sweep into contiguous blocks, one WASM run each.
 *
 *  WHY THE SWEEP IS CHUNKED AT ALL, and it is not for speed.  A `speciate` that
 *  does not converge is a FATAL for the whole process — one refusing point ends
 *  the run — and the worker harvests output files only when the exit code is 0.
 *  So a single point the model cannot answer would take the entire diagram with
 *  it.  That point is easy to reach and is not a bug: at 100 °C, Kw is
 *  10^-12.24, so an imposed pH of 14 asks for tens of moles of OH per kilogram
 *  and the ionic-strength fixed point diverges — the engine is right to refuse.
 *
 *  CONTIGUOUS, never round-robin.  The refusals cluster at an END of the pH
 *  range, so contiguous blocks lose a contiguous band and the diagram simply
 *  stops where the model does; round-robin would scatter the loss across the
 *  whole axis and read as noise.  The caller reports how many points were lost
 *  and quotes the engine's own refusal — the band is a stated gap, never a
 *  silently shortened curve.
 *
 *  Blocks are kept few (each costs a worker + a WASM instantiation) and never
 *  shorter than `minBlock`, because a one-point block cannot be expressed as a
 *  from/to/n grid without duplicating its own endpoint. */
export function bjerrumChunks(
  n: number, maxBlocks = 4, minBlock = 4,
): { lo: number; hi: number }[] {
  const count = Math.max(2, Math.round(n));
  const blocks = Math.max(1, Math.min(maxBlocks, Math.floor(count / minBlock)));
  const base = Math.floor(count / blocks);
  const extra = count % blocks;
  const out: { lo: number; hi: number }[] = [];
  let lo = 0;
  for (let b = 0; b < blocks; ++b) {
    const size = base + (b < extra ? 1 : 0);
    out.push({ lo, hi: lo + size });
    lo += size;
  }
  return out;
}

/** One point's engine output: the pH that was imposed and the species table
 *  `speciate` wrote for it (`species,molality,activity,gamma`). */
export interface BjerrumPoint {
  pH: number;
  csv: string;
  /** The engine's own charge residual for this point, or null when the line
   *  was not on the log (see the header — this is read, never computed). */
  netCharge: number | null;
}

/** LONG -> WIDE.  N species tables, one per pH, become one scan CSV:
 *
 *      pH,CO2aq,HCO3,CO3,H,OH[,netCharge]
 *
 *  Values are the engine's molalities [mol/kg water], copied verbatim.  Column
 *  order is first-appearance order across the points, which is the engine's own
 *  ordering rather than one invented here.  A species absent from a point
 *  leaves that cell EMPTY (a gap in the line), never a zero — absent and "too
 *  small to matter" are different claims.  `netCharge` is appended only when
 *  EVERY point carried one: a column that silently means "some points" would
 *  be worse than no column. */
export function mergeBjerrumCsvs(points: BjerrumPoint[]): string {
  const species: string[] = [];
  const rows: { pH: number; m: Map<string, string>; q: number | null }[] = [];

  for (const pt of points) {
    const m = new Map<string, string>();
    const lines = pt.csv.trim().split(/\r?\n/).filter((l) => l.length > 0);
    // header is `species,molality,activity,gamma` — molality is column 1
    for (let i = 1; i < lines.length; ++i) {
      const cells = lines[i]!.split(",");
      const name = (cells[0] ?? "").trim();
      const molality = (cells[1] ?? "").trim();
      if (!name || !molality) continue;
      if (!species.includes(name)) species.push(name);
      m.set(name, molality);
    }
    rows.push({ pH: pt.pH, m, q: pt.netCharge });
  }
  if (species.length === 0) return "";

  const withCharge = rows.length > 0 && rows.every((r) => r.q !== null);
  const header = ["pH", ...species, ...(withCharge ? ["netCharge"] : [])];
  const out = [header.join(",")];
  for (const r of rows)
    out.push([
      String(r.pH),
      ...species.map((s) => r.m.get(s) ?? ""),
      ...(withCharge ? [String(r.q)] : []),
    ].join(","));
  return out.join("\n") + "\n";
}

/** The pH the engine was working on when it refused, read off the run log.
 *
 *  `speciate` announces `speciation: <n> master total(s) + pH <v> (given), T =
 *  <T> K` before it solves, so the LAST such line in a failed run names the
 *  point that could not be answered.  Returned with the engine's own fatal
 *  sentence so the caller quotes it rather than paraphrasing it.  Null when the
 *  log carries no refusal (or none this pattern recognises — in which case the
 *  caller must say the run failed without saying where, not invent a where). */
export function parseRefusalPoint(log: string): { pH: number; message: string } | null {
  const fatal = log.match(/^.*(?:fatal error|\*\*\*).*$/gm);
  const pts = [...log.matchAll(/pH\s+(-?[\d.]+)\s+\(given\)/g)];
  if (!fatal || fatal.length === 0 || pts.length === 0) return null;
  const v = Number(pts[pts.length - 1]![1]);
  if (!Number.isFinite(v)) return null;
  return { pH: v, message: fatal[fatal.length - 1]!.trim() };
}

/** The engine's per-operation charge residual, read off the run log.
 *
 *  `speciate` prints, once per operation and only at verbosity >= 2:
 *
 *    charge balance on the answer: sum z_i m_i / sum |z_i| m_i = 9.91e-01
 *        (pH GIVEN -- this is the net charge the analysis carries)
 *
 *  The operation banner `>>>  Operation [k]:` delimits the blocks, so index k
 *  is the k-th point of the sweep.  Returns an array of length `n`; an entry is
 *  null when no such line was found for that point. */
export function parseChargeResiduals(log: string, n: number): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(n).fill(null);
  const banner = /^>>>\s+Operation\s+\[(\d+)\]/gm;
  const marks: { index: number; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = banner.exec(log)) !== null)
    marks.push({ index: Number(m[1]), at: m.index });

  const value =
    /charge balance on the answer:[^\n]*?=\s*(-?[\d.]+(?:[eE][-+]?\d+)?)\s+\(pH GIVEN/;
  for (let k = 0; k < marks.length; ++k) {
    const seg = log.slice(marks[k]!.at, marks[k + 1]?.at ?? log.length);
    const hit = seg.match(value);
    const idx = marks[k]!.index;
    if (hit && idx >= 0 && idx < n) {
      const v = Number(hit[1]);
      if (Number.isFinite(v)) out[idx] = v;
    }
  }
  return out;
}

/** The engine sentences this lens must not swallow, deduplicated.
 *
 *  The sweep runs N operations at ONE temperature, so the honesty lines that
 *  matter here — which K(T) route each equilibrium took, the activity model's
 *  own trust band, the extrapolation advisories, the Henry pin, the scale the
 *  imposed pH is READ on — are identical across all N and would otherwise
 *  arrive N times.  Deduplicating is a display decision (one line, one claim);
 *  DROPPING one would not be, so nothing matching is filtered out. */
export function bjerrumEngineNotes(log: string): string[] {
  const re = new RegExp(
    "^\\s*(?:"
    + "\\[advisory\\][^\\n]*"                       // K(T) extrapolated, Davies out of band, …
    + "|\\[chemistry\\] closure[^\\n]*"             // what the network reached / could not
    + "|speciation: pH scale[^\\n]*"                // the imposed pH is on the MODEL's scale
    + "|aqueous activity:[^\\n]*"                   // the γ model states its OWN scope
    + "|K\\(T\\)[^\\n]*"                            // analytic / van't Hoff / held at 25 C
    + "|OPEN to [^\\n]*"                            // the Henry pin
    + "|--\\s+the .*REPLACED by the pin[^\\n]*"     // …and what the pin replaced
    + ")$",
    "gm",
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of log.match(re) ?? []) {
    const t = line.trim();
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
