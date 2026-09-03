/*---------------------------------------------------------------------------*\
  componentRecord — read a component `.dat` as a SCIENTIFIC OBJECT.

  The Property Explorer's compound browser answers "which substances exist";
  this answers "what do we actually know about this one, and how well".  It is
  the model behind the Component Inspector (double-click a compound), built on
  the SAME dict parse the catalogue manifest already runs — no new dependency,
  no physics, no second parser.

  THE GUI RENDERS VERDICTS, IT NEVER MINTS THEM (Vítor, 2026-08-11).  Every
  field below is either read off the record or derived by an arithmetic the
  record makes obvious (a block is present or it is not).  The scientific
  quality of a datum — measured / fitted / validated — is NOT knowable from the
  record and is NOT guessed here: it is the curation dossier's verdict, and
  until a dossier is attached this module reports `notClaimed`, which is the
  dossier's own word for "nobody has claimed anything about this".  Inventing a
  friendlier five-badge scheme in the UI would create a second home for a
  scientific classification, which is exactly the arity sin the engine spends
  twelve gates preventing.

  ABSENCE IS RENDERED, NEVER OMITTED.  A missing CAS is shown as a declared gap
  with its remedy — dropping the row would read as "this substance has no CAS",
  a claim nobody has earned.  247 catalogue records carry 189 CAS numbers and
  zero InChIKeys today; the inspector must show that honestly rather than look
  complete.
\*---------------------------------------------------------------------------*/

import type { JsonDict, JsonValue } from "../dict/index.js";
import { parse, toJson } from "../dict/index.js";

/** The five verdicts the curation dossier computes (CurationDossier.cpp
 *  `verdictOf`).  The GUI mirrors this union EXACTLY — a sixth value here would
 *  be a scientific classification the engine never made. */
export type CurationVerdict =
  | "validated"
  | "notValidated"
  | "heldOutPerformed"
  | "validationRefused"
  | "notClaimed";

export interface IdentityRow {
  label: string;
  /** the declared value, or null when the record does not carry the field */
  value: string | null;
  /** shown in place of the value when it is null — what would supply it */
  gap?: string;
}

export interface CapabilityRow {
  key: string;
  label: string;
  /** the record carries the block this capability needs */
  present: boolean;
  /** the model / numbers actually declared, e.g. "Antoine · 273–369 K" */
  detail: string;
  /** what the capability unlocks — the teaching half of a ✗ */
  unlocks: string;
  /** the curation dossier's verdict for this property.  `notClaimed` while no
   *  dossier is attached: no evidence has been declared, so no claim exists. */
  verdict: CurationVerdict;
}

export interface ModelRow {
  slot: string;
  model: string;
  detail: string;
}

/** ONE per-value provenance block, as `estimateComponent` writes them:
 *
 *      provenance
 *      {
 *          Tc { origin estimated; method "Joback"; methodVersion "...";
 *               inputFingerprint "CH3:2,ketone:1";
 *               uncertainty { status unquantified; reason "..."; } }
 *      }
 *
 *  A GENERATED component and a CURATED one are the same shape on screen until
 *  something reads these, and the difference is the whole point: Joback's Tc
 *  carries ~10 % error and the inspector was showing it exactly like a
 *  measured critical temperature.  Nothing here is inferred -- a block counts
 *  as a per-value origin only when it DECLARES `origin`, which is the axis
 *  itself, never a list of field names this file would have to keep in step
 *  with the engine. */
export interface ValueOrigin {
  /** the value the block is about -- `Tb`, `Tc`, `Pc`, ... */
  field: string;
  /** the declared origin word, verbatim: `estimated`, `measured`, ... */
  origin: string;
  /** the operation that produced it, and which revision of it */
  method: string;
  methodVersion: string;
  /** the identity of the inputs, so a drift is detectable from the file */
  inputFingerprint: string;
  /** what the record says about its own error.  `unquantified` is a REAL
   *  answer and is shown as one -- it is not the same as saying nothing. */
  uncertaintyStatus: string;
  uncertaintyReason: string;
}

export interface RecordMark {
  kind: "reviewStatus" | "tier" | "role" | "estimate" | "synthetic";
  text: string;
  tone: "warn" | "info";
}

export interface ComponentRecord {
  name: string;
  formula: string;
  identity: IdentityRow[];
  capabilities: CapabilityRow[];
  models: ModelRow[];
  /** per-value provenance, in the order the record declares it.  Empty for a
   *  record that carries none -- which is most of the curated catalogue, and
   *  is itself worth seeing. */
  valueOrigins: ValueOrigin[];
  marks: RecordMark[];
  /** the record verbatim — "[view raw record]" shows this, never a re-render */
  raw: string;
}

// ---------------------------------------------------------------- helpers --

function str(v: JsonValue | undefined): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

function dict(v: JsonValue | undefined): JsonDict | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as JsonDict) : null;
}

function num(v: JsonValue | undefined): number | null {
  return typeof v === "number" ? v : null;
}

/** "273–369 K" from a `Trange (273 369)`, or "" when the record declares none.
 *  A DECLARED absence (`Trange unknown;`, the AP3 third state) is reported as
 *  such — it is not the same as no key at all, and the engine distinguishes
 *  them, so the inspector must too. */
function trange(block: JsonDict | null): string {
  if (!block) return "";
  const t = block.Trange;
  if (typeof t === "string") return t === "unknown" ? " · validity DECLARED UNKNOWN" : ` · ${t}`;
  if (Array.isArray(t) && t.length === 2 && typeof t[0] === "number" && typeof t[1] === "number")
    return ` · ${t[0]}–${t[1]} K`;
  return "";
}

function modelOf(block: JsonDict | null, fallback = "declared"): string {
  if (!block) return "";
  return str(block.model) ?? fallback;
}

// ------------------------------------------------------------------ build --

/** Parse a component `.dat` into the inspector's model.  Returns null when the
 *  body does not parse or declares no name — the caller then refuses honestly
 *  rather than rendering an empty shell. */
export function readComponentRecord(raw: string): ComponentRecord | null {
  let j: JsonDict;
  try { j = toJson(parse(raw)); } catch { return null; }
  const name = str(j.name);
  if (!name) return null;
  const formula = str(j.formula) ?? "";

  // -- IDENTITY.  Absent fields are rows with a gap, never dropped rows. ----
  const identity: IdentityRow[] = [
    { label: "name", value: name },
    { label: "formula", value: formula || null,
      gap: "no molecular formula declared — the element balance refuses this component by name" },
    { label: "CAS", value: str(j.CAS),
      gap: "not declared in this record" },
    { label: "molar mass", value: num(j.MW) !== null ? `${num(j.MW)} g/mol` : null,
      gap: "not declared — derivable from the formula, but the record does not state it" },
    // Neither key exists anywhere in the catalogue today (0 of 247 records).
    // The row is shown BECAUSE it is empty: it names what curation will supply.
    { label: "InChI", value: str(j.InChI),
      gap: "not carried by Choupo records yet — ThermoML curation supplies it" },
    { label: "InChIKey", value: str(j.InChIKey),
      gap: "not carried by Choupo records yet — ThermoML curation supplies it" },
  ];

  // -- PROPERTY COVERAGE.  The first five mirror the engine's own
  //    ComponentCoverage (SolverAdapter.ts) so the inspector and the Props
  //    readiness table can never disagree about what a gap is. -------------
  const vp = dict(j.vaporPressure);
  const cpIg = dict(j.idealGasHeatCapacity);
  const cpLiq = dict(j.liquidHeatCapacity);
  const therm = dict(j.standardThermochemistry);
  const visc = dict(j.liquidViscosity);
  const tc = num(j.Tc);
  const pc = num(j.Pc);
  const nonvolatile = j.role === "nonvolatile";

  const cap = (
    key: string, label: string, present: boolean, detail: string, unlocks: string,
  ): CapabilityRow => ({ key, label, present, detail, unlocks, verdict: "notClaimed" });

  const capabilities: CapabilityRow[] = [
    cap("criticals", "Critical constants",
      tc !== null && pc !== null,
      tc !== null && pc !== null ? `Tc ${tc} K · Pc ${pc} bar${num(j.omega) !== null ? ` · ω ${num(j.omega)}` : ""}` : "",
      "equation of state, corresponding states"),
    cap("psat", "Vapour pressure",
      vp !== null,
      vp !== null ? `${modelOf(vp)}${trange(vp)}` : "",
      nonvolatile ? "not applicable — declared `role nonvolatile`" : "VLE, flash, distillation"),
    cap("vliq", "Liquid molar volume",
      num(j.Vliq) !== null,
      num(j.Vliq) !== null ? `${num(j.Vliq)} m³/mol` : "",
      "pump work, liquid density"),
    cap("cpIdealGas", "Ideal-gas heat capacity",
      cpIg !== null,
      cpIg !== null ? `${modelOf(cpIg)}${trange(cpIg)}` : "",
      "energy balances, enthalpy on the gas rung"),
    cap("gibbs", "Formation datum",
      therm !== null,
      therm !== null
        ? `ΔHf° ${num(therm.dHf_298) ?? "—"} J/mol${num(therm.s_298) !== null ? ` · s° ${num(therm.s_298)} J/(mol·K)` : ""}`
          + ` · ${str(therm.referenceState) ?? "idealGas"} rung`
        : "",
      "Gibbs reactor, heat of reaction"),
    cap("cpLiquid", "Liquid heat capacity",
      cpLiq !== null,
      cpLiq !== null ? `${modelOf(cpLiq, "polynomial")}${trange(cpLiq)}` : "",
      "sensible duty on a liquid stream"),
    cap("viscosity", "Liquid viscosity",
      visc !== null,
      visc !== null ? Object.keys(visc).join(" / ") : "",
      "pressure drop, transport"),
  ];

  // -- RESOLVED MODELS: the optional per-model blocks the record carries.
  //    Presence here means the component CAN be used with that model; it says
  //    nothing about how good the parameters are (that is the dossier's job).
  const models: ModelRow[] = [];
  const addModel = (slot: string, key: string, describe: (b: JsonDict) => string) => {
    const b = dict(j[key]);
    if (b) models.push({ slot, model: key, detail: describe(b) });
  };
  addModel("Activity (UNIQUAC)", "uniquac",
    (b) => `r ${num(b.r) ?? "—"} · q ${num(b.q) ?? "—"}`);
  addModel("Equation of state (PC-SAFT)", "pcsaft",
    (b) => `m ${num(b.m) ?? "—"} · σ ${num(b.sigma) ?? "—"} Å · ε/k ${num(b.epsilonK) ?? "—"} K`
      + (str(b.assocScheme) ? ` · assoc ${str(b.assocScheme)}` : " · non-associating"));
  addModel("Activity (COSMO-SAC)", "cosmo",
    (b) => `${Object.keys(b).length} parameter set(s): ${Object.keys(b).join(", ")}`);
  addModel("Electrolyte", "electrolyte",
    (b) => Object.keys(b).join(", "));
  addModel("Solid phase", "solidPhases",
    (b) => Object.keys(b).join(", "));
  const groups = dict(j.groups);
  if (groups) {
    models.push({ slot: "Group contribution", model: "groups",
      detail: Object.keys(groups).join(", ") });
  }

  // -- MARKS: the provenance the engine itself announces at run time. ------
  const marks: RecordMark[] = [];
  const review = str(j.reviewStatus);
  if (review) {
    marks.push({ kind: "reviewStatus", text:
      `reviewStatus ${review} — the engine announces this record [unreviewed]`, tone: "warn" });
  }
  if (nonvolatile) {
    marks.push({ kind: "role", text:
      "role nonvolatile — no vapour pressure BY DESIGN; the absence above is a modelling choice, not a gap",
      tone: "info" });
  }
  // A SYNTHETIC STAND-IN IS NOT A CHEMICAL, and the record now says so in a
  // field rather than in a banner comment the parser discards (engine mark
  // `[synthetic]`, Database.cpp).  The GUI RENDERS that declaration; it does
  // not infer one -- a CAS of 00-00-0 would have been a reasonable guess and
  // guessing is exactly what philosophy §3c forbids here.
  const prov = dict(j.provenance);

  // -- PER-VALUE PROVENANCE.  A generated component must not read like a
  //    curated one.  `estimateComponent` writes a block per value it derived;
  //    nothing read them, so a Joback Tc (~10 % error) was drawn exactly like
  //    a measured critical temperature.
  //
  //    The test is STRUCTURAL: a sub-dict of `provenance` that declares
  //    `origin` IS a per-value block.  A name list would be a second home for
  //    the engine's own field vocabulary and would go stale the first time a
  //    generator learns a new value.
  const valueOrigins: ValueOrigin[] = [];
  if (prov) {
    for (const [field, v] of Object.entries(prov)) {
      const blk = dict(v);
      const originWord = blk ? str(blk.origin) : null;
      if (!blk || !originWord) continue;
      const unc = dict(blk.uncertainty);
      valueOrigins.push({
        field,
        origin: originWord,
        method: str(blk.method) ?? "",
        methodVersion: str(blk.methodVersion) ?? "",
        inputFingerprint: str(blk.inputFingerprint) ?? "",
        uncertaintyStatus: unc ? (str(unc.status) ?? "") : "",
        uncertaintyReason: unc ? (str(unc.reason) ?? "") : "",
      });
    }
  }

  // The mark is raised for any origin that is NOT an experimental one.  The two
  // experimental words are the engine's own (`core/Origin.H`: `literature`
  // accepts `experimental` and `measured`); everything else -- estimated,
  // predictive, regressed, assumed, placeholder -- is a number somebody or
  // something PRODUCED, and the reader is told which values and by what.
  const derivedOrigins = valueOrigins.filter(
    (v) => v.origin !== "measured" && v.origin !== "experimental" && v.origin !== "literature");
  if (derivedOrigins.length > 0) {
    const words = [...new Set(derivedOrigins.map((v) => v.origin))].join(" / ");
    const methods = [...new Set(derivedOrigins.map((v) => v.method).filter(Boolean))].join(", ");
    const fields = derivedOrigins.map((v) => v.field).join(", ");
    const unquantified = derivedOrigins.filter((v) => v.uncertaintyStatus === "unquantified").length;
    marks.push({
      kind: "estimate", tone: "warn",
      text: `origin ${words} on ${derivedOrigins.length} declared value(s): ${fields}` +
        (methods ? ` — ${methods}` : "") +
        (unquantified > 0
          ? `.  ${unquantified} of them declare their uncertainty UNQUANTIFIED, which is the record's own answer and not a missing field.`
          : "."),
    });
  }

  if (prov && str(prov.source) === "synthetic") {
    const why = str(prov.reason);
    marks.push({ kind: "synthetic", tone: "warn", text:
      "provenance source synthetic — NOT a real substance" +
      (why ? ` (${why})` : "") +
      ".  Any number computed with it describes the algorithm, never a chemical." });
  }

  return { name, formula, identity, capabilities, models, valueOrigins, marks, raw };
}
