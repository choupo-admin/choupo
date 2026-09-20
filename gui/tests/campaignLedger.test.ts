// campaignLedger -- the PURE projection of the two batch campaign ledgers.
//
// THE CLAIM UNDER TEST, and it is one claim wearing several hats: an engine
// REFUSAL survives the projection as a refusal.  `src/result/ResultEmitter.cpp`
// writes `H_kJ` only when `H_valid` and `E_kJ` only when `E_valid`, and emits
// neither boolean -- so the number's PRESENCE is its validity, and any reader
// that defaults an absent one to 0 fabricates a closed balance out of a
// refusal.  Several of these tests exist to go RED under exactly that edit.
//
// THE FIXTURES ARE MEASURED, not invented: every record below is copied from a
// real run of the case named beside it (the whole `tutorials/batch` corpus was
// swept on 2026-09-20).  `still06_ledger_mixed_validity` is the witness that
// carries priced AND refused records in both ledgers at once; the three
// adsorber cases are the ones carrying a priced EXACT ZERO, which is the state
// a `?? 0` reader makes indistinguishable from a refusal.
import { describe, expect, it } from "vitest";
import {
  campaignLedgerView, energyRow, transferRow, energyScale,
  energyFraction, energyDirection, energyHover, transferHover,
  matchTransferRows, energyScaleSentence, hasCampaignSequence,
  fmtInterval, fmtNum,
} from "../src/case/campaignLedger.js";
import type {
  EnergyRecord, TransferRecord,
} from "../src/adapters/SolverAdapter.js";

//  still06_ledger_mixed_validity, verbatim from the run.
const PRICED: EnergyRecord = {
  tStart: 200, tEnd: 600, unit: "potA", kind: "reboiler",
  E_kJ: 20.7851317858, T_service_K: 371.612121862,
  basis: "reboiler: first law over the pot, Q = dH_pot + Sum n_pkg*h_vap",
};
const COOLING: EnergyRecord = {
  tStart: 200, tEnd: 600, unit: "potA", kind: "condenser",
  E_kJ: -19.4076039275, T_service_K: 365.266949466,
  basis: "condenser: Q = -Sum n_pkg*[h_vap - h_liq](T_pkg)",
};
//  NOTE the T_service_K ON A REFUSED RECORD: the engine publishes one here,
//  so T_service is NOT a proxy for validity and a reader must not use it so.
const REFUSED: EnergyRecord = {
  tStart: 0, tEnd: 200, unit: "potA", kind: "reboiler",
  T_service_K: 372.484229602,
  E_missing: ["no enthalpy datum for 'compA'"],
  basis: "still duty UNAVAILABLE: unpriceable segment",
};
//  batch14_transport_only: a PRICED record whose E_kJ is exactly 0.
const ZERO: EnergyRecord = {
  tStart: 0, tEnd: 8, unit: "bed", kind: "adsorption", E_kJ: 0,
  basis: "adsorption: isothermal bed, no heat of adsorption declared",
};
//  recipe02_setpoint_ramp: an IMPULSE -- real energy, zero duration.
const IMPULSE: EnergyRecord = {
  tStart: 200, tEnd: 200, unit: "reactor", kind: "impulse",
  E_kJ: 65.5399876371, basis: "impulse: datum jump priced at the instant",
};

const T_PRICED: TransferRecord = {
  tStart: 100, tEnd: 100, from: "hot", to: "cold", kind: "discrete",
  dn: { ethanol: 0.0005 }, H_kJ: -136.599454691,
};
const T_REFUSED: TransferRecord = {
  tStart: 1, tEnd: 600, from: "potA", to: "recA", kind: "continuous",
  dn: { benzene: 0.000580389346996, compA: 3.51356617833e-6,
        toluene: 0.000316097087527 },
  H_missing: ["compA"],
};

describe("the absence contract", () => {
  it("a record with no E_kJ is REFUSED, and carries the engine's reason", () => {
    const r = energyRow(REFUSED);
    expect(r.validity).toBe("refused");
    expect(r.E_kJ).toBeUndefined();
    expect(r.missing).toEqual(["no enthalpy datum for 'compA'"]);
  });

  //  THE LOAD-BEARING TEST.  Goes RED the moment a reader writes `?? 0`:
  //  a refused record would then read "priced" with E_kJ 0, which is the
  //  claim the engine declined to make.
  it("REFUSED and a priced EXACT ZERO are different states", () => {
    const refused = energyRow(REFUSED);
    const zero = energyRow(ZERO);
    expect(refused.validity).toBe("refused");
    expect(zero.validity).toBe("priced");
    expect(zero.E_kJ).toBe(0);
    expect(refused.validity).not.toBe(zero.validity);
    //  and they must not collapse in the drawing either
    expect(energyDirection(refused)).toBeNull();
    expect(energyDirection(zero)).toBe(0);
  });

  it("T_service_K on a refused record does not make it priced", () => {
    const r = energyRow(REFUSED);
    expect(r.T_service_K).toBeCloseTo(372.484229602);
    expect(r.validity).toBe("refused");
  });

  it("a non-finite number is not a price", () => {
    expect(energyRow({ ...PRICED, E_kJ: NaN }).validity).toBe("refused");
    expect(transferRow({ ...T_PRICED, H_kJ: Infinity }).validity)
      .toBe("refused");
  });

  it("a transfer with no H_kJ is refused and names its species", () => {
    const r = transferRow(T_REFUSED);
    expect(r.validity).toBe("refused");
    expect(r.H_kJ).toBeUndefined();
    expect(r.missing).toEqual(["compA"]);
  });

  it("a refusal with no stated reason still refuses, and says so", () => {
    const r = energyRow({ tStart: 0, tEnd: 1, unit: "u", kind: "k",
                          basis: "b" });
    expect(r.validity).toBe("refused");
    expect(r.missing).toEqual([]);
    expect(energyHover(r)).toContain("the engine named no reason");
  });
});

describe("energyScale -- a declared reference, or none at all", () => {
  it("is the run's own largest |E| over PRICED records", () => {
    const s = energyScale([PRICED, COOLING, REFUSED].map(energyRow));
    expect(s.maxAbsKJ).toBeCloseTo(20.7851317858);
    expect(s.reason).toBeUndefined();
  });

  //  batch03_consecutive is this state in the corpus: every record refused.
  it("is NULL when every record is refused, and says which", () => {
    const s = energyScale([REFUSED].map(energyRow));
    expect(s.maxAbsKJ).toBeNull();
    expect(s.reason).toBe("all refused");
  });

  //  batch14 / batch16 / batch24.  Dividing by this would be 0/0.
  it("is NULL when every priced record is exactly zero", () => {
    const s = energyScale([ZERO].map(energyRow));
    expect(s.maxAbsKJ).toBeNull();
    expect(s.reason).toBe("every priced record is exactly zero");
  });

  it("is NULL with no records at all, and says THAT instead", () => {
    expect(energyScale([]).reason).toBe("no records");
  });
});

//  WHETHER THE VIEW IS OFFERED AT ALL.  This is the decision that made ten
//  corpus cases' energy history reachable, and it SURVIVED its first sabotage
//  (narrowed back to the timeline alone, all 4053 tests stayed green) because
//  it lived inside a `useMemo` in a React component and nothing in this repo
//  renders one.  It is a fact about the ledgers, so it lives with them.
describe("hasCampaignSequence", () => {
  it("is true on an ENERGY ledger with no timeline -- the ten cases", () => {
    //  batch01_first_order: one energy record, zero timeline events.
    expect(hasCampaignSequence({ energyLedger: [PRICED] })).toBe(true);
    expect(hasCampaignSequence({ timeline: [], energyLedger: [PRICED] }))
      .toBe(true);
  });

  it("is true on a MATERIAL ledger with no timeline", () => {
    expect(hasCampaignSequence({ transfers: [T_PRICED] })).toBe(true);
  });

  it("is true on a timeline alone -- nothing that worked stopped", () => {
    expect(hasCampaignSequence({ timeline: [{}] })).toBe(true);
  });

  it("is false on a run with none of the three, and on no run", () => {
    expect(hasCampaignSequence({})).toBe(false);
    expect(hasCampaignSequence({ timeline: [], transfers: [],
                                 energyLedger: [] })).toBe(false);
    expect(hasCampaignSequence(undefined)).toBe(false);
    expect(hasCampaignSequence(null)).toBe(false);
  });
});

//  THE SENTENCE THE LEGEND PRINTS.  Nothing in this repo renders React, so a
//  string built inside GanttPlot would be asserted by nothing at all; it lives
//  here instead, which also makes it the ONE home the pop-out table shares.
describe("energyScaleSentence", () => {
  it("DECLARES the reference, in both surfaces' phrasing", () => {
    const s = energyScale([PRICED, COOLING].map(energyRow));
    expect(energyScaleSentence(s, true)).toBe("full height = 20.7851 kJ");
    expect(energyScaleSentence(s, false))
      .toBe("largest |E| in this run: 20.7851 kJ");
  });

  //  An undeclared scale is the 2026-09-08 "the numerical FLOOR is not a
  //  scale" defect one drawing along.  Where there is none, the sentence
  //  says WHICH of the two states it is, and never invents a reference.
  it("names the absence rather than inventing a reference", () => {
    expect(energyScaleSentence(energyScale([energyRow(REFUSED)]), true))
      .toBe("no scale — all refused");
    expect(energyScaleSentence(energyScale([energyRow(ZERO)]), false))
      .toBe("no energy scale — every priced record is exactly zero");
    expect(energyScaleSentence(energyScale([]), true))
      .toBe("no scale — no records");
  });

  it("never prints a bare number without saying what it is", () => {
    for (const rows of [[PRICED], [REFUSED], [ZERO], []]) {
      const t = energyScaleSentence(energyScale(rows.map(energyRow)), true);
      expect(t).toMatch(/full height = |no scale — /);
    }
  });
});

describe("energyFraction / energyDirection", () => {
  const scale = energyScale([PRICED, COOLING, REFUSED].map(energyRow));

  it("normalises against the declared scale, sign carried separately", () => {
    expect(energyFraction(energyRow(PRICED), scale)).toBeCloseTo(1);
    expect(energyFraction(energyRow(COOLING), scale))
      .toBeCloseTo(19.4076039275 / 20.7851317858);
    expect(energyDirection(energyRow(PRICED))).toBe(1);
    expect(energyDirection(energyRow(COOLING))).toBe(-1);
  });

  //  A refusal has NO magnitude and NO direction; the caller draws the
  //  hatched form off exactly this pair of nulls.
  it("states NO fraction and NO direction for a refusal", () => {
    expect(energyFraction(energyRow(REFUSED), scale)).toBeNull();
    expect(energyDirection(energyRow(REFUSED))).toBeNull();
  });

  it("states no fraction when the run has no scale", () => {
    expect(energyFraction(energyRow(ZERO), energyScale([energyRow(ZERO)])))
      .toBeNull();
  });

  it("marks a zero-duration record instantaneous", () => {
    expect(energyRow(IMPULSE).instantaneous).toBe(true);
    expect(energyRow(PRICED).instantaneous).toBe(false);
  });
});

describe("transferRow -- the quantities the timeline throws away", () => {
  //  THE DEFECT THIS SLICE EXISTS FOR, stated as a test.  On
  //  recipe04_charge_enthalpy the engine publishes the per-component dn AND
  //  the 136.6 kJ that travelled with it; the timeline's own `detail` string
  //  is "TRANSFER 0.0005 kmol hot -> cold" -- the map summed, the enthalpy
  //  gone.
  it("keeps dn PER COMPONENT and the transported H", () => {
    const r = transferRow(T_PRICED);
    expect(r.dn).toEqual([{ component: "ethanol", kmol: 0.0005 }]);
    expect(r.H_kJ).toBeCloseTo(-136.599454691);
    const h = transferHover(r);
    expect(h).toContain("ethanol");
    expect(h).toContain("-136.599");
  });

  it("orders dn by descending magnitude, then by name", () => {
    const r = transferRow(T_REFUSED);
    expect(r.dn.map((d) => d.component))
      .toEqual(["benzene", "toluene", "compA"]);
  });

  it("a refused transfer's hover shows the refusal, never a number", () => {
    const h = transferHover(transferRow(T_REFUSED));
    expect(h).toContain("H UNPRICEABLE");
    expect(h).toContain("compA");
    expect(h).not.toMatch(/H transported/);
  });

  it("computes no total -- summing dn is the collapse being undone", () => {
    const r = transferRow(T_REFUSED);
    expect(r).not.toHaveProperty("total");
    expect(transferHover(r)).not.toMatch(/total/i);
  });
});

describe("campaignLedgerView", () => {
  it("groups energy by vessel and lists only the kinds this run has", () => {
    const v = campaignLedgerView([T_PRICED],
                                 [PRICED, COOLING, REFUSED, IMPULSE]);
    expect([...v.energyByUnit.keys()]).toEqual(["potA", "reactor"]);
    expect(v.energyByUnit.get("potA")).toHaveLength(3);
    expect(v.energyKinds).toEqual(["condenser", "impulse", "reboiler"]);
  });

  //  The legend is built from THIS, never from a canon: the one in
  //  `SimulationResult.H`'s comment names five words the engine never writes
  //  and misses four it does (measured 2026-09-20).
  it("carries a kind the stale canon never heard of, unchanged", () => {
    const v = campaignLedgerView(undefined, [
      { tStart: 0, tEnd: 1, unit: "bed", kind: "wallHeat", E_kJ: 1,
        basis: "b" },
    ]);
    expect(v.energyKinds).toEqual(["wallHeat"]);
  });

  it("an absent ledger is empty, never invented", () => {
    const v = campaignLedgerView(undefined, undefined);
    expect(v.energy).toEqual([]);
    expect(v.transfers).toEqual([]);
    expect(v.energyByUnit.size).toBe(0);
    expect(v.scale.maxAbsKJ).toBeNull();
  });
});

describe("matchTransferRows -- the mark back to its record", () => {
  const rows = [T_PRICED, T_REFUSED].map(transferRow);

  it("matches a discrete mark on the edge and its tEnd", () => {
    expect(matchTransferRows(rows, { lane: "hot", toLane: "cold", t: 100 }))
      .toHaveLength(1);
  });

  it("matches a continuous mark on the edge and BOTH ends", () => {
    expect(matchTransferRows(rows,
      { lane: "potA", toLane: "recA", t: 1, tEnd: 600 })).toHaveLength(1);
    expect(matchTransferRows(rows,
      { lane: "potA", toLane: "recA", t: 1, tEnd: 599 })).toHaveLength(0);
  });

  it("matches nothing for a mark with no destination (setParameter)", () => {
    expect(matchTransferRows(rows, { lane: "hot", t: 100 })).toEqual([]);
  });

  //  Three corpus cases log TWO feedAmendment records on one edge at one
  //  instant (measured by check_campaign_ledger_pinned).  BOTH are returned:
  //  picking one would be a guess.
  it("returns EVERY record on an edge at one instant, never one of them", () => {
    const twin = [T_PRICED, { ...T_PRICED, dn: { water: 0.002 } }]
      .map(transferRow);
    expect(matchTransferRows(twin, { lane: "hot", toLane: "cold", t: 100 }))
      .toHaveLength(2);
  });
});

describe("formatting", () => {
  it("names an instantaneous interval as one", () => {
    expect(fmtInterval(200, 200)).toBe("t = 200 s (instantaneous)");
    expect(fmtInterval(200, 600)).toBe("[200, 600] s");
  });

  it("an energy hover states the direction in words and the basis", () => {
    expect(energyHover(energyRow(PRICED))).toContain("added to the vessel");
    expect(energyHover(energyRow(COOLING))).toContain("removed from the vessel");
    expect(energyHover(energyRow(PRICED))).toContain("basis:");
    expect(energyHover(energyRow(REFUSED))).toContain("E UNPRICEABLE");
    expect(energyHover(energyRow(REFUSED))).not.toMatch(/E = /);
  });

  it("renders a non-finite number as an em dash, never as 0", () => {
    expect(fmtNum(NaN)).toBe("—");
    expect(fmtNum(0)).toBe("0");
  });
});
