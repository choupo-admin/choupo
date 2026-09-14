/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  caseThermo — THE ONE HOME for "what thermodynamics does this case declare?".

  WHY IT EXISTS.  Three surfaces asked that question and each answered it for
  itself, by looking for a TOP-LEVEL `activityModel` / `equationOfState` — the
  FLAT v1 form, retired by the v2 contract of 2026-07-17.  There is no v1 path
  left in `ThermoPackageBuilder` (its only dispatch is `buildV2Dispatch`), so
  no shipped case can carry those keys and the readers found nothing BY
  CONSTRUCTION.  Finding nothing, they did not say so: they asserted
  "(not declared — defaults to ideal)" and "(not declared — defaults to ideal
  gas)".  Measured over the corpus on 2026-09-14: 404 thermoPhysPropDict, ALL
  schemaVersion 2, of which 365 declare BOTH a liquid model and a vapour
  fugacity model and were told they declare neither.  Vitor found it on a
  200 bar Haber-Bosch plant, which the panel described as ideal gas.

  THE RULE THIS ENFORCES, and it is the general one:

      A READER THAT CANNOT PARSE A GRAMMAR MUST REFUSE, NOT REPORT AN ABSENCE.

  "Not declared" and "I cannot read this file" are different sentences and
  only one of them was true.  Same rule as `bin/drive-app` refusing when its
  browser never reached the page (2026-09-06), and as "a check that cannot run
  must not pass".

  ITS COROLLARY, which is what made the old sentence actively harmful: a
  DEFAULT THAT IS USED IS ANNOUNCED, AND A DECLARED VALUE ANNOUNCES NOTHING
  (the 2026-09-06 costing-defaults rule).  268 of these cases declare
  `activityModel { model ideal; }` IN SO MANY WORDS.  The panel printed the
  same word, "ideal", but attached the opposite claim to it — that the author
  had chosen nothing and the engine had filled the gap.  A reader cannot tell
  a deliberate ideal-gas assumption from a forgotten one, which is exactly the
  ambiguity the glass box exists to remove.

  FOUR STATES, NEVER TWO.  Measured across the corpus rather than imagined:

      declared    365  the slot carries a model word; draw it, and say where
                       in the grammar it was found
      noModel       5  the phase block is there and carries no model word --
                       the `formulation` settles it under the one-knob rule,
                       so name the formulation rather than guessing a model
      noPhase       7  an equilibrium block with no block for this phase: the
                       case does not model this phase at all
      unreadable   21  no equilibrium block -- this is not a case-level
                       thermophysical system (a propsDict-driven case), and
                       the honest answer is that there is nothing here to read

  WHAT THIS MODULE DOES NOT DO.  It does not re-derive the engine's answer.
  Where a run exists, the engine PUBLISHES each unit's world and the GUI draws
  that (the engine decides, the GUI draws — 2026-09-05); this reader serves
  the pre-run screens, where there is no result and the declaration is all
  there is.  It reads the DECLARATION and reports it as a declaration, never
  as a computed conclusion.

  AND IT KEEPS NO v1 FALLBACK.  A fallback to dead grammar is the legacy
  again under another name: the retired keys are not consulted, so a file
  carrying them reads as `unreadable` and says so.
\*---------------------------------------------------------------------------*/

/** The GUI's parsed-dict value type, as the dict reader produces it. */
export type ThermoJson = { [key: string]: unknown };

export type ThermoState = "declared" | "noModel" | "noPhase" | "unreadable";

export interface ThermoReading {
  state: ThermoState;
  /** The model word, when one was declared.  Never invented. */
  model: string | null;
  /** The grammar path it was found at, so a reader can go and look —
   *  e.g. "equilibrium.liquid.activityModel.model". */
  where: string | null;
  /** More than one model on this phase (a two-liquid case declares one per
   *  phase); each entry is "<phaseName>: <model>". */
  perPhase: string[];
}

export interface CaseThermo {
  schemaVersion: number | null;
  /** The v2 one-knob selector: choosing it settles the activity model, the
   *  standard states and the Henry treatment together. */
  formulation: string | null;
  components: string[];
  liquid: ThermoReading;
  vapour: ThermoReading;
  /** True when the case declares an aqueous ION network.  A molecular case
   *  has none and that is a FACT about it, not a gap — the block is called
   *  `equilibrium` whether or not there is chemistry in it, which is what
   *  makes a reader expect reactions that are not there. */
  hasAqueousChemistry: boolean;
  /** Set when the whole file could not be read as a v2 system. */
  unreadableReason: string | null;
}

const dict = (v: unknown): ThermoJson | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as ThermoJson) : null;

const word = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

/** THREE LIVE SHAPES, and the third is why the corpus arm exists.
 *
 *    activityModel NRTL;                        bare word (a propsDict op)
 *    activityModel { model NRTL; }              block form
 *    activityModel { ionic davies; molecular NRTL; }   COMPOSITE
 *
 *  The composite is the mixed-solvent electrolyte world (CLAUDE.md 5, built
 *  2026-07-26): the ions take one model on water-referenced molality and the
 *  molecular backbone takes another, and the solvent activity decomposes
 *  multiplicatively across the two.  It carries NO `model` key at all, so a
 *  reader keyed on that word finds nothing -- and reporting just ONE of the
 *  two axes would be the same class of falsehood this module exists to end,
 *  one level down: a brine that runs Davies on its ions and NRTL on its
 *  backbone is not "a Davies case".  Both axes are reported, or neither.
 *
 *  Found by the corpus arm in tests/caseThermo.test.ts, on
 *  `flash13_acetic_ethanol_vacuum_flash` and `flash21_brine_co2_pitzer`,
 *  after the first draft of this reader had already passed every fixture a
 *  hand wrote for it. */
function modelWord(v: unknown): string | null {
  const w = word(v);
  if (w) return w;
  const d = dict(v);
  if (!d) return null;
  const plain = word(d["model"]);
  if (plain) return plain;
  const axes: string[] = [];
  for (const axis of ["ionic", "molecular"]) {
    const a = word(d[axis]);
    if (a) axes.push(`${axis} ${a}`);
  }
  return axes.length > 0 ? axes.join(" + ") : null;
}

const MISSING = (s: ThermoState): ThermoReading =>
  ({ state: s, model: null, where: null, perPhase: [] });

/** Read one liquid-ish phase block.  The corpus uses three container names --
 *  `liquid`, `aqueous` and the LIST form `liquidPhases ( {…} {…} )` -- and a
 *  case may carry more than one at once (a wet organic declares `liquid` and
 *  `aqueous`), so every present container contributes. */
function readLiquid(eq: ThermoJson): ThermoReading {
  const found: string[] = [];
  let first: string | null = null;
  let firstWhere: string | null = null;

  const take = (m: string | null, label: string, where: string): void => {
    if (!m) return;
    found.push(`${label}: ${m}`);
    if (first === null) { first = m; firstWhere = where; }
  };

  for (const key of ["liquid", "aqueous", "organic"]) {
    const d = dict(eq[key]);
    if (!d) continue;
    take(modelWord(d["activityModel"]), key,
      `equilibrium.${key}.activityModel`);
    //  The dilute-solution world states its liquid model on the SOLUTES
    //  group: the solvent sits on the Raoult rung and the solutes on the
    //  infinite-dilution rung, and `solutionModel` is the word that says so.
    const sol = dict(d["solutes"]);
    if (sol) take(modelWord(sol["solutionModel"]), `${key}.solutes`,
      `equilibrium.${key}.solutes.solutionModel`);
  }

  const list = eq["liquidPhases"];
  if (Array.isArray(list))
    for (const entry of list) {
      const d = dict(entry);
      if (!d) continue;
      const name = word(d["name"]) ?? "liquid";
      take(modelWord(d["activityModel"]), name,
        `equilibrium.liquidPhases[${name}].activityModel`);
    }

  const anyContainer = ["liquid", "aqueous", "organic"].some((k) => dict(eq[k]))
    || Array.isArray(eq["liquidPhases"]);
  if (found.length === 0) return MISSING(anyContainer ? "noModel" : "noPhase");
  return { state: "declared", model: first, where: firstWhere, perPhase: found };
}

function readVapour(eq: ThermoJson): ThermoReading {
  const d = dict(eq["vapour"]);
  if (!d) return MISSING("noPhase");
  const m = modelWord(d["fugacityModel"]);
  if (!m) return MISSING("noModel");
  return {
    state: "declared", model: m,
    where: "equilibrium.vapour.fugacityModel", perPhase: [],
  };
}

/** An aqueous ION network -- a speciation set or a reaction list. */
function readChemistry(eq: ThermoJson): boolean {
  const aq = dict(eq["aqueous"]);
  if (aq && (aq["speciation"] !== undefined || aq["network"] !== undefined))
    return true;
  return eq["reactions"] !== undefined || eq["speciation"] !== undefined;
}

export function caseThermo(tp: ThermoJson | null | undefined): CaseThermo {
  const base: CaseThermo = {
    schemaVersion: null, formulation: null, components: [],
    liquid: MISSING("unreadable"), vapour: MISSING("unreadable"),
    hasAqueousChemistry: false, unreadableReason: null,
  };
  if (!tp) {
    return { ...base, unreadableReason: "no thermoPhysPropDict is loaded" };
  }

  const sv = tp["schemaVersion"];
  base.schemaVersion = typeof sv === "number" ? sv : null;
  const comps = tp["components"];
  base.components = Array.isArray(comps)
    ? comps.filter((c): c is string => typeof c === "string") : [];

  const eq = dict(tp["equilibrium"]);
  if (!eq) {
    //  THE REFUSAL.  Not "nothing is declared" -- this file does not present
    //  a case-level equilibrium system at all, and saying which is the whole
    //  point of the module.
    return {
      ...base,
      unreadableReason: base.schemaVersion === null
        ? "this file declares no schemaVersion and no equilibrium block, so "
          + "it is not a v2 thermophysical system this panel can read"
        : `schemaVersion ${base.schemaVersion} declares no equilibrium block: `
          + "this case's properties are driven elsewhere (a propsDict case), "
          + "so there is no case-level equilibrium system to show",
    };
  }

  return {
    ...base,
    formulation: word(eq["formulation"]),
    liquid: readLiquid(eq),
    vapour: readVapour(eq),
    hasAqueousChemistry: readChemistry(eq),
  };
}

/** The sentence a surface draws for one slot.  ONE home for the wording too:
 *  three panels phrasing the same four states differently is how they drifted
 *  apart in the first place. */
export function thermoSentence(r: ThermoReading, phase: "liquid" | "vapour",
  formulation: string | null): string {
  switch (r.state) {
    case "declared":
      return r.perPhase.length > 1 ? r.perPhase.join(" · ") : (r.model ?? "");
    case "noModel":
      return formulation
        ? `no model word in the ${phase} block — the declared `
          + `formulation (${formulation}) settles it`
        : `no model word in the ${phase} block, and no formulation is `
          + "declared to settle it";
    case "noPhase":
      return `this case declares no ${phase} phase`;
    case "unreadable":
      return "not readable";
  }
}
