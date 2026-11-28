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
  Model applicability -- can the model the student picked price the
  components the student picked?  (Explorer, 2026-11-25.)

  THE DEFECT.  Picking tertButylbenzene with the UNIFAC activity model ended
  in a red box reading "[stderr] *** choupoProps fatal error: UNIFAC:
  component(s) tertButylbenzene have no group decomposition, so UNIFAC cannot
  price them."  The engine was right to refuse; the screen was a dead end: the
  model was offered, the run was started, and the student was left with a
  sentence of the engine's and nothing to do next.  A measurement of every
  model choice the Explorer can generate against the catalogue (the table is in
  docs/audits/2026-11-25-explorer/) found the same shape for UNIFAC (no groups),
  NRTL (no curated pair), Wilson (no liquid volume), SRK/PR (no Tc/Pc) and one
  liquid-conductivity model the screen offered and the engine does not register.

  THE CONTRACT (the GUI draws, the engine decides).  This file does NOT price
  anything and does NOT guess what the engine will do.  It reads FACTS OF THE
  RECORD the engine's own refusals are written against -- a `groups { unifac }`
  block, a curated pair file, Vliq, Tc and Pc -- and states them before the run:

    * `activityVerdict` / `eosVerdict`: can this model price this set, and if
      not the reason in ONE line ("no UNIFAC groups for tertButylbenzene");
    * `chooseActivity`: when the current model cannot, the nearest one that
      can, and the sentence that SAYS the default moved -- never silent;
    * `refusalAdvice`: when the engine refuses anyway, the engine's sentence in
      plain words, what to do next, and the one model that would run.

  Every verdict is a prediction of a refusal the engine ALREADY makes; the
  engine stays the authority, and a refusal this file did not foresee is shown
  by `refusalAdvice` with the engine's own text, never swallowed.
\*---------------------------------------------------------------------------*/

import type { ComponentMeta } from "./catalogue.js";

/** The liquid activity models the Explorer offers, in the order it lists them. */
export const ACTIVITY_MODELS = ["ideal", "NRTL", "Wilson", "UNIFAC"] as const;
/** The vapour models the Explorer offers. */
export const EOS_MODELS = ["idealGas", "SRK", "PR"] as const;

/** What the catalogue (and the open case) can answer. */
export interface ApplicabilityCtx {
  metaOf: (component: string) => ComponentMeta | undefined;
  /** the record (or a case-local block) carries UNIFAC groups */
  hasUnifac: (component: string) => boolean;
  /** a curated pair exists for the model */
  hasPair: (model: string, a: string, b: string) => boolean;
}

export interface Verdict {
  ok: boolean;
  /** one line, present exactly when `ok` is false */
  reason?: string;
}

const OK: Verdict = { ok: true };
const no = (reason: string): Verdict => ({ ok: false, reason });

function pairsOf(comps: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < comps.length; ++i)
    for (let j = i + 1; j < comps.length; ++j) out.push([comps[i]!, comps[j]!]);
  return out;
}

function list(xs: string[]): string {
  return xs.length <= 3 ? xs.join(", ") : `${xs.slice(0, 3).join(", ")} and ${xs.length - 3} more`;
}

/** Can this liquid activity model price this set?  `ideal` always can. */
export function activityVerdict(model: string, comps: string[], ctx: ApplicabilityCtx): Verdict {
  if (model === "ideal") return OK;
  if (model === "UNIFAC") {
    const miss = comps.filter((c) => !ctx.hasUnifac(c));
    return miss.length === 0 ? OK : no(`no UNIFAC groups for ${list(miss)}`);
  }
  if (model === "NRTL" || model === "Wilson") {
    if (model === "Wilson") {
      const miss = comps.filter((c) => !((ctx.metaOf(c)?.vliq ?? 0) > 0));
      if (miss.length > 0) return no(`no liquid molar volume (Vliq) for ${list(miss)}`);
    }
    const missing = pairsOf(comps).filter(([a, b]) => !ctx.hasPair(model, a, b));
    return missing.length === 0 ? OK
      : no(`no curated ${model} pair for ${list(missing.map(([a, b]) => `${a}\u2013${b}`))}`);
  }
  return OK;
}

/** Can this vapour model price this set?  `idealGas` always can; the cubics
 *  need Tc and Pc (the engine refuses a component without them). */
export function eosVerdict(model: string, comps: string[], ctx: ApplicabilityCtx): Verdict {
  if (model === "SRK" || model === "PR") {
    const miss = comps.filter((c) => {
      const m = ctx.metaOf(c);
      return !(m && (m.tc ?? 0) > 0 && (m.pc ?? 0) > 0);
    });
    return miss.length === 0 ? OK : no(`no critical constants (Tc, Pc) for ${list(miss)}`);
  }
  return OK;
}

/** The liquid-transport correlations the engine registers and the record form each one reads
 *  (LiquidViscosityModel.cpp, LiquidConductivityModel.cpp).  A record that holds another form
 *  is refused by name -- and, for Andrade/Vogel, with the misleading sentence "has no
 *  `liquidViscosity` block" on a record that does have one (it is of the other form). */
export const TRANSPORT_MODELS: Record<string, { models: string[]; form: Record<string, string> }> = {
  viscosity_liquid: { models: ["chemsepEq101", "Andrade", "Vogel"],
    form: { chemsepEq101: "chemsepEq101", Andrade: "andrade", Vogel: "vogel" } },
  thermal_conductivity_liquid: { models: ["SatoRiedel", "chemsepEq16"],
    form: { chemsepEq16: "chemsepEq16" } },
};

/** Can this liquid-transport correlation answer for this set?  One line, or ok. */
export function transportVerdict(property: string, model: string, comps: string[], ctx: ApplicabilityCtx): Verdict {
  const fam = TRANSPORT_MODELS[property];
  const form = fam?.form[model];
  if (!form) {
    if (model === "SatoRiedel") {
      const miss = comps.filter((c) => { const m = ctx.metaOf(c); return !(m && (m.tc ?? 0) > 0 && (m.tb ?? 0) > 0); });
      return miss.length === 0 ? OK : no(`no Tc and Tb (Sato-Riedel reads them) for ${list(miss)}`);
    }
    return OK;
  }
  const have = property === "viscosity_liquid" ? (m: ComponentMeta | undefined) => m?.viscForms
    : (m: ComponentMeta | undefined) => m?.condForms;
  const miss = comps.filter((c) => !(have(ctx.metaOf(c)) ?? []).includes(form));
  return miss.length === 0 ? OK : no(`no ${form} coefficients in the record of ${list(miss)}`);
}

/** The correlation to run for a transport property: the pick when it can answer, else the first
 *  listed that can, with the sentence saying so; when none can, the pick stays and the engine's
 *  refusal is explained by `refusalAdvice`. */
export function chooseTransport(property: string, pick: string, comps: string[], ctx: ApplicabilityCtx):
  { model: string; changed: boolean; note: string | null } {
  const models = TRANSPORT_MODELS[property]?.models ?? [];
  const cur = transportVerdict(property, pick, comps, ctx);
  if (cur.ok || models.length === 0) return { model: pick, changed: false, note: null };
  for (const cand of models)
    if (transportVerdict(property, cand, comps, ctx).ok)
      return { model: cand, changed: true, note: `${pick} cannot answer for this set (${cur.reason}); running ${cand} instead.` };
  return { model: pick, changed: false, note: null };
}

/** The model to run: the CURRENT one when it can price the set, else the
 *  nearest that can, with the sentence that says the choice moved.  The
 *  preference when the current model cannot: the other fitted-pair model, then
 *  the predictive one, then ideal -- the same order the Explorer's own default
 *  uses, so nothing the student could have picked first is skipped. */
export function chooseActivity(current: string, comps: string[], ctx: ApplicabilityCtx):
  { model: string; changed: boolean; note: string | null } {
  const cur = activityVerdict(current, comps, ctx);
  if (cur.ok) return { model: current, changed: false, note: null };
  const order: Record<string, string[]> = {
    UNIFAC: ["NRTL", "Wilson", "ideal"],
    NRTL: ["Wilson", "UNIFAC", "ideal"],
    Wilson: ["NRTL", "UNIFAC", "ideal"],
  };
  for (const cand of order[current] ?? ["NRTL", "Wilson", "UNIFAC", "ideal"]) {
    if (activityVerdict(cand, comps, ctx).ok)
      return { model: cand, changed: true,
        note: `${current} cannot price this set (${cur.reason}); running ${cand === "ideal" ? "ideal mixing" : cand} instead.` };
  }
  return { model: "ideal", changed: true,
    note: `${current} cannot price this set (${cur.reason}); running ideal mixing instead.` };
}

/** The vapour model to run, by the same rule (the nearest is the ideal gas). */
export function chooseEos(current: string, comps: string[], ctx: ApplicabilityCtx):
  { model: string; changed: boolean; note: string | null } {
  const cur = eosVerdict(current, comps, ctx);
  if (cur.ok) return { model: current, changed: false, note: null };
  const alt = current === "PR" ? "SRK" : "PR";
  const pick = eosVerdict(alt, comps, ctx).ok ? alt : "idealGas";
  return { model: pick, changed: true,
    note: `${current} cannot price this set (${cur.reason}); running ${pick === "idealGas" ? "the ideal gas" : pick} instead.` };
}

/** A context that knows nothing: for a surface that has no catalogue to ask
 *  (the advice then carries the engine's meaning and the next step, and no
 *  model suggestion the surface could not act on anyway). */
export const NO_CTX: ApplicabilityCtx = {
  metaOf: () => undefined, hasUnifac: () => false, hasPair: () => false,
};

// ---- when the engine refuses anyway ----------------------------------------

export interface RefusalAdvice {
  /** what happened, in plain words */
  plain: string;
  /** what to do next */
  next: string;
  /** a liquid activity model that would run, when the refusal is about one */
  tryActivity?: string;
  /** a vapour model that would run, when the refusal is about one */
  tryEos?: string;
  /** the engine's own sentence, verbatim, for the fold */
  raw: string;
}

/** The engine's sentence with the log prefixes the browser worker adds taken
 *  off (the prefix is not part of what the engine said). */
export function engineSentence(raw: string): string {
  return raw.replace(/^\s*(?:choupoProps did not finish:\s*)?(?:\[stderr\]\s*)?(?:\*{3}\s*)?(?:choupoProps fatal error:\s*)?/i, "").trim();
}

/** Read the engine's refusal and say what to do.  Unknown sentences are not
 *  guessed at: they come back with the engine's text as the explanation. */
export function refusalAdvice(raw: string, state: { activity: string; eos: string; comps: string[] },
                              ctx: ApplicabilityCtx): RefusalAdvice {
  const s = engineSentence(raw);
  let m: RegExpMatchArray | null;
  //  The model the ENGINE just refused is excluded even when the record seems to allow it: the
  //  engine has the last word, and a suggestion that repeats its refusal is not a next step.
  const nearest = (failed: string): { model: string } => {
    const order: Record<string, string[]> = {
      UNIFAC: ["NRTL", "Wilson", "ideal"], NRTL: ["Wilson", "UNIFAC", "ideal"], Wilson: ["NRTL", "UNIFAC", "ideal"],
    };
    for (const cand of order[failed] ?? ["NRTL", "Wilson", "UNIFAC", "ideal"])
      if (cand !== failed && activityVerdict(cand, state.comps, ctx).ok) return { model: cand };
    return { model: "ideal" };
  };
  const word = (model: string) => (model === "ideal" ? "ideal mixing" : model);

  if ((m = s.match(/^UNIFAC: component\(s\) (.+?) have no group decomposition/))) {
    const alt = nearest("UNIFAC");
    return { raw,
      plain: `UNIFAC prices a liquid from the molecular groups each component is made of, and ${m[1]} has no group decomposition in its record, so UNIFAC cannot price it.`,
      next: `Run ${word(alt.model)} instead, or add a \`groups { unifac (...) }\` block to the component's record (case-local) and run UNIFAC again.`,
      tryActivity: alt.model };
  }
  if ((m = s.match(/^(NRTL|Wilson): the case declares \1, but (\d+) binary pair\(s\) have no parameters.*?: (.+)$/))) {
    const alt = nearest(m[1]!);
    return { raw,
      plain: `${m[1]} needs fitted binary parameters for every pair, and none is curated for ${m[3]}; running it would silently treat that pair as ideal, so the engine stops instead.`,
      next: `Run ${word(alt.model)} instead (UNIFAC predicts from groups where both components have them), or add the pair as a case-local record.`,
      tryActivity: alt.model };
  }
  if ((m = s.match(/^Wilson: component '(.+?)' has Vliq <= 0/))) {
    const alt = nearest("Wilson");
    return { raw,
      plain: `The Wilson model scales its parameters by the liquid molar volume, and the record of ${m[1]} carries none.`,
      next: `Run ${word(alt.model)} instead, or add \`Vliq\` to the record.`,
      tryActivity: alt.model };
  }
  if ((m = s.match(/^(SRK|PR): component '(.+?)' is missing Tc or Pc/))) {
    const alt = chooseEos(m[1]!, state.comps, ctx);
    return { raw,
      plain: `A cubic equation of state is written in the critical constants, and the record of ${m[2]} lacks Tc or Pc.`,
      next: "Run the ideal gas instead, or add the critical constants to the record.",
      tryEos: alt.model === m[1] ? "idealGas" : alt.model };
  }
  if ((m = s.match(/^LiquidConductivityModel: unknown model '(.+?)'/)))
    return { raw,
      plain: `The engine has no liquid-conductivity model named ${m[1]}.`,
      next: "Pick SatoRiedel.", };
  //  A scan that produced no value says why at its first point; read THAT sentence.
  if ((m = s.match(/produced NO value at any of the \d+ points.*?Reason at the first point:\s*(.+)$/))) {
    const inner = refusalAdvice(m[1]!, state, ctx);
    return { ...inner, raw, plain: inner.plain };
  }
  if ((m = s.match(/^(Andrade|Vogel|chemsepEq101) viscosity: component '(.+?)' has no `liquidViscosity` block/)))
    return { raw,
      plain: `${m[1]} reads one form of the liquid-viscosity record, and the record of ${m[2]} holds another (or none): the engine's sentence says "no block" for both.`,
      next: "Pick the viscosity correlation the record holds: the picker lists each correlation with the reason it is off." };
  if ((m = s.match(/^Component '(.+?)': no 'vaporPressure' block/)))
    return { raw,
      plain: `${m[1]} has no vapour-pressure law in its record (it is a solid or an involatile species), and every property evaluated through the saturation pressure needs one.`,
      next: "Pick a volatile component, or a property that does not touch the vapour pressure." };
  if ((m = s.match(/Dictionary '.*?' \(.*?([A-Za-z0-9_]+)\.dat\): missing scalar entry '(.+?)'/)))
    return { raw,
      plain: `The record of ${m[1]} has no ${m[2]}, which every property of this scan reads.`,
      next: "Pick another component, or run the scan on a case-local copy of the record that carries it." };
  if ((m = s.match(/Component '(.+?)': (?:h|s)_pure_ig\(T\) needs a standardThermochemistry block/)))
    return { raw,
      plain: `H and S of ${m[1]} are measured from the formation datum in its record, and the record has none.`,
      next: "Plot Z or the molar volume instead, which do not need it." };
  if ((m = s.match(/ThermoPackage::Cp_ig: component '(.+?)' has no idealGasHeatCapacity block/)))
    return { raw,
      plain: `${m[1]} has no ideal-gas heat-capacity law in its record.`,
      next: "Pick a gas or vapour component, or a different property." };
  if (/the liquid does not boil even at/.test(s))
    return { raw,
      plain: "At this temperature the liquid's bubble pressure is below the solver's floor of 0.01 bar, so there is no bubble-pressure curve to draw.",
      next: "Raise the temperature of the P-x-y." };
  if (/standardThermochemistry.*missing scalar entry/.test(s))
    return { raw,
      plain: "This property needs the formation enthalpy and entropy of the component, and its record has none.",
      next: "Pick a component whose record carries `standardThermochemistry`, or a property that does not need it (vapour pressure, liquid density)." };
  if (/^shadow:/.test(s))
    return { raw,
      plain: "A component record shipped with the case shadows the catalogue record of the same name without saying what it is.",
      next: "Declare `overlayOf` or `variationOf` in that record, or delete the copy." };
  return { raw,
    plain: s.length > 0 ? s : "The engine stopped without giving a reason.",
    next: "Change the components, the model or the range; the engine's own text is below." };
}
