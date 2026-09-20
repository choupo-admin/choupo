// ganttLayout -- the campaign-sequence geometry (lanes, span, marks).
import { describe, expect, it } from "vitest";
import {
  ganttLanes, ganttSpan, ganttMarks, LANE_TOP, LANE_HEIGHT, PLOT_LEFT,
} from "../src/ui/plotting/ganttLayout.js";
import type { TimelineEvent } from "../src/adapters/SolverAdapter.js";

const ev = (o: Partial<TimelineEvent>): TimelineEvent => ({
  t: 0, kind: "recipe", action: "transfer", detail: "", trigger: "time",
  from: "", to: "", ...o,
});

describe("ganttLanes", () => {
  it("orders lanes by the campaign's story (event appearance), then idle"
     + " KPI vessels; the campaign aggregate never gets a lane", () => {
    const storyLanes = ganttLanes(["campaign", "receiver", "still"], [
      ev({ from: "reactor", to: "still" }),
      ev({ from: "still", to: "receiver" }),
    ]);
    expect(storyLanes).toEqual(["reactor", "still", "receiver"]);
    const lanes = ganttLanes(["reactor", "still"], [
      ev({ from: "still", to: "receiver" }),
      ev({ from: "receiver" }),
    ]);
    expect(lanes).toEqual(["still", "receiver", "reactor"]);
  });
  it("never invents a lane for an empty from/to", () => {
    expect(ganttLanes([], [ev({ from: "", to: "" })])).toEqual([]);
  });
});

describe("ganttSpan", () => {
  it("covers t_end and the last event, padded", () => {
    expect(ganttSpan(600, [ev({ t: 700 })])).toBeCloseTo(714);
    expect(ganttSpan(600, [ev({ t: 100 })])).toBeCloseTo(612);
  });
  it("degenerate all-zero span widens to 1 s", () => {
    expect(ganttSpan(undefined, [ev({ t: 0 })])).toBe(1);
  });
});

describe("ganttMarks", () => {
  it("places a transfer on its source lane and points at the destination", () => {
    const lanes = ["reactor", "still"];
    const m = ganttMarks(
      [ev({ t: 400, from: "reactor", to: "still", detail: "TRANSFER" })],
      lanes, 800, 700,
    )[0]!;
    expect(m.laneY).toBeCloseTo(LANE_TOP + LANE_HEIGHT * 0.5);
    expect(m.toY).toBeCloseTo(LANE_TOP + LANE_HEIGHT * 1.5);
    expect(m.x).toBeCloseTo(PLOT_LEFT + (400 / 800) * 700);
  });
  it("drops events whose acting unit has no lane, keeps to-less events", () => {
    const marks = ganttMarks(
      [ev({ from: "ghost" }), ev({ from: "still", action: "setParameter" })],
      ["still"], 100, 500,
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]!.toY).toBeUndefined();
  });
});

/*  ---- the SECOND BAND (2026-09-20) --------------------------------------
 *
 *  The energy band's geometry.  The invariant that matters most is the
 *  NEGATIVE one: a run with no energy ledger must draw exactly what it drew
 *  before this existed, which is asserted against the formula the plot used
 *  rather than against a remembered number.
 */
import {
  ganttGeometry, ganttEnergyTiles, energyKindColour,
  ENERGY_BAND_HEIGHT, ENERGY_MIN_TILE_W, ENERGY_MIN_BAR_H,
} from "../src/ui/plotting/ganttLayout.js";
import { energyRow, energyScale } from "../src/case/campaignLedger.js";
import type { EnergyRecord } from "../src/adapters/SolverAdapter.js";

const er = (o: Partial<EnergyRecord> & { unit: string }): EnergyRecord => ({
  tStart: 0, tEnd: 100, kind: "reboiler", basis: "b", ...o,
});
const rowsOf = (...recs: EnergyRecord[]) => {
  const m = new Map<string, ReturnType<typeof energyRow>[]>();
  for (const r of recs.map(energyRow)) {
    const l = m.get(r.unit); if (l) l.push(r); else m.set(r.unit, [r]);
  }
  return m;
};

describe("ganttGeometry", () => {
  //  THE BYTE-IDENTICAL PATH.  Nothing moves for a case with no energy
  //  ledger -- the same posture the engine takes when a case declares no
  //  utility circuit.  Goes RED if the band is ever given unconditional
  //  height.
  it("reproduces the pre-existing lane formula when NO unit has energy", () => {
    const lanes = ["reactor", "still", "receiver"];
    const g = ganttGeometry(lanes, new Map());
    lanes.forEach((u, i) => {
      expect(g.laneCentres.get(u))
        .toBeCloseTo(LANE_TOP + LANE_HEIGHT * (i + 0.5));
    });
    expect(g.contentBottom).toBe(LANE_TOP + lanes.length * LANE_HEIGHT);
    expect(g.boxes.every((b) => b.energyBaselineY === undefined)).toBe(true);
  });

  it("and ganttMarks agrees with it -- the map and the default coincide", () => {
    const lanes = ["reactor", "still"];
    const g = ganttGeometry(lanes, new Map());
    const evs = [ev({ from: "reactor", to: "still", t: 50 })];
    const withMap = ganttMarks(evs, lanes, 100, 700, g.laneCentres);
    const without = ganttMarks(evs, lanes, 100, 700);
    expect(withMap).toEqual(without);
  });

  //  A LANE WITHOUT ENERGY GETS NO BAND AND NO HEIGHT.  An empty band would
  //  read as "no heat"; "this vessel ledgers no segment" is a different fact.
  it("gives a band ONLY to a unit that has records, and pushes the rest down",
     () => {
    const lanes = ["potA", "recA", "potB"];
    const g = ganttGeometry(lanes, rowsOf(er({ unit: "potA", E_kJ: 5 }),
                                          er({ unit: "potB", E_kJ: -5 })));
    expect(g.boxes[0]!.energyBaselineY).toBeDefined();
    expect(g.boxes[1]!.energyBaselineY).toBeUndefined();
    expect(g.boxes[2]!.energyBaselineY).toBeDefined();
    //  recA is a bare lane, so potB starts one LANE_HEIGHT after potA's block
    expect(g.boxes[1]!.top).toBe(LANE_TOP + LANE_HEIGHT + ENERGY_BAND_HEIGHT);
    expect(g.boxes[2]!.top).toBe(g.boxes[1]!.top + LANE_HEIGHT);
    expect(g.contentBottom)
      .toBe(LANE_TOP + 3 * LANE_HEIGHT + 2 * ENERGY_BAND_HEIGHT);
  });

  it("the baseline is the band's centre, so up and down have equal room", () => {
    const g = ganttGeometry(["potA"], rowsOf(er({ unit: "potA", E_kJ: 1 })));
    const b = g.boxes[0]!;
    expect(b.energyBaselineY! - b.energyTop!)
      .toBeCloseTo(b.energyBottom! - b.energyBaselineY!);
  });
});

describe("ganttEnergyTiles", () => {
  const box = (recs: EnergyRecord[]) =>
    ganttGeometry(["u"], rowsOf(...recs)).boxes[0]!;

  it("SIGN IS DIRECTION: + draws up from the baseline, - draws down", () => {
    const recs = [er({ unit: "u", E_kJ: 10 }), er({ unit: "u", E_kJ: -10 })];
    const rows = recs.map(energyRow);
    const tiles = ganttEnergyTiles(rows, box(recs), energyScale(rows),
                                   100, 700);
    expect(tiles[0]!.form).toBe("up");
    expect(tiles[0]!.y + tiles[0]!.height)
      .toBeCloseTo(box(recs).energyBaselineY!);
    expect(tiles[1]!.form).toBe("down");
    expect(tiles[1]!.y).toBeCloseTo(box(recs).energyBaselineY!);
  });

  it("height is the magnitude against the run's own scale", () => {
    const recs = [er({ unit: "u", E_kJ: 20 }), er({ unit: "u", E_kJ: 10 })];
    const rows = recs.map(energyRow);
    const tiles = ganttEnergyTiles(rows, box(recs), energyScale(rows),
                                   100, 700);
    expect(tiles[0]!.height).toBeCloseTo(ENERGY_BAND_HEIGHT / 2);
    expect(tiles[1]!.height).toBeCloseTo(ENERGY_BAND_HEIGHT / 4);
  });

  //  UNKNOWN IS NOT ZERO, and this is where the drawing says so.
  it("a REFUSED record fills the band, hatched, with no direction", () => {
    const recs = [er({ unit: "u", E_kJ: 10 }),
                  er({ unit: "u", E_missing: ["no datum"] })];
    const rows = recs.map(energyRow);
    const tiles = ganttEnergyTiles(rows, box(recs), energyScale(rows),
                                   100, 700);
    expect(tiles[1]!.form).toBe("refused");
    expect(tiles[1]!.height).toBe(ENERGY_BAND_HEIGHT);
    expect(tiles[1]!.y).toBe(box(recs).energyTop!);
  });

  //  ...and its counterpart: a PRICED zero is a zero, drawn as one.  If
  //  these two ever produce the same form, the drawing has fabricated the
  //  claim the engine refused to make.
  it("a priced EXACT ZERO is a baseline tick, NOT the refused form", () => {
    const recs = [er({ unit: "u", E_kJ: 10 }), er({ unit: "u", E_kJ: 0 })];
    const rows = recs.map(energyRow);
    const tiles = ganttEnergyTiles(rows, box(recs), energyScale(rows),
                                   100, 700);
    expect(tiles[1]!.form).toBe("zero");
    expect(tiles[1]!.height).toBe(0);
    expect(tiles[1]!.y).toBeCloseTo(box(recs).energyBaselineY!);
    expect(tiles[1]!.form).not.toBe(tiles[0]!.form);
  });

  //  The minimum height is for a tiny NON-ZERO record.  Applying it to a
  //  measured zero would make the two the same picture -- the `?? 0`
  //  fabrication wearing the opposite sign.
  it("a tiny non-zero record is visibly tiny, and a zero is not raised", () => {
    const recs = [er({ unit: "u", E_kJ: 1000 }),
                  er({ unit: "u", E_kJ: 1e-9 }),
                  er({ unit: "u", E_kJ: 0 })];
    const rows = recs.map(energyRow);
    const tiles = ganttEnergyTiles(rows, box(recs), energyScale(rows),
                                   100, 700);
    expect(tiles[1]!.height).toBe(ENERGY_MIN_BAR_H);
    expect(tiles[2]!.height).toBe(0);
  });

  it("with NO scale at all, nothing claims a magnitude", () => {
    const recs = [er({ unit: "u", E_missing: ["x"] })];
    const rows = recs.map(energyRow);
    const tiles = ganttEnergyTiles(rows, box(recs), energyScale(rows),
                                   100, 700);
    expect(tiles[0]!.form).toBe("refused");
  });

  //  An IMPULSE has energy and no modelled duration; a zero-width tile is
  //  invisible, so it is widened -- and flagged, so the widening does not
  //  read as an interval.
  it("an instantaneous record still renders, at the minimum width", () => {
    const recs = [er({ unit: "u", tStart: 50, tEnd: 50, kind: "impulse",
                       E_kJ: 65 })];
    const rows = recs.map(energyRow);
    const tiles = ganttEnergyTiles(rows, box(recs), energyScale(rows),
                                   100, 700);
    expect(tiles[0]!.width).toBe(ENERGY_MIN_TILE_W);
    expect(tiles[0]!.row.instantaneous).toBe(true);
  });

  //  A still's reboiler and condenser run over the SAME interval.  Dropping
  //  one would be a lie about what the vessel did.
  it("keeps every overlapping record on one lane", () => {
    const recs = [er({ unit: "u", kind: "reboiler", E_kJ: 20 }),
                  er({ unit: "u", kind: "condenser", E_kJ: -19 })];
    const rows = recs.map(energyRow);
    expect(ganttEnergyTiles(rows, box(recs), energyScale(rows), 100, 700))
      .toHaveLength(2);
  });

  it("returns nothing for a box with no energy band", () => {
    const bare = ganttGeometry(["u"], new Map()).boxes[0]!;
    expect(ganttEnergyTiles([energyRow(er({ unit: "u", E_kJ: 1 }))], bare,
                            energyScale([]), 100, 700)).toEqual([]);
  });
});

describe("energyKindColour", () => {
  it("is stable per kind and tells the corpus's kinds apart", () => {
    const live = ["reaction", "reboiler", "condenser", "adsorption",
                  "latent", "impulse", "wallHeat"];
    const seen = live.map(energyKindColour);
    expect(new Set(seen).size).toBe(live.length);
    expect(energyKindColour("reboiler")).toBe(energyKindColour("reboiler"));
  });

  //  NO CLOSED LIST TO GO STALE.  The canon in SimulationResult.H's comment
  //  already is (four live kinds absent, five of its words never written),
  //  so an unknown kind must arrive DRAWN, deterministically, rather than
  //  falling into an "other" bucket or crashing.
  it("gives an unknown kind a stable colour rather than nothing", () => {
    const c = energyKindColour("someKindNobodyHasWrittenYet");
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(energyKindColour("someKindNobodyHasWrittenYet")).toBe(c);
  });

  //  ...AND THE FALLBACK SPREADS.  This arm exists because the one above
  //  SURVIVED a sabotage that returned a single constant grey for every
  //  unknown kind: stable and well-formed, and two new kinds in one band
  //  would have been one colour.  The claim is deliberately the weak one the
  //  code can actually keep -- a 6-colour ring HASHED by name can collide,
  //  so no pair is promised to differ; what is promised is that the fallback
  //  is not a constant, and the legend names every kind either way.
  it("spreads unknown kinds over the fallback ring, never one colour", () => {
    const unknown = Array.from({ length: 24 },
                               (_, i) => `futureKind${i}`);
    const distinct = new Set(unknown.map(energyKindColour));
    expect(distinct.size).toBeGreaterThan(1);
    //  and no unknown kind may borrow a KNOWN kind's colour, or a new kind
    //  would draw as `reboiler` in a still's band
    const knownColours = new Set(["reaction", "reboiler", "condenser",
      "adsorption", "latent", "impulse", "wallHeat"].map(energyKindColour));
    for (const c of distinct) expect(knownColours.has(c)).toBe(false);
  });
});
