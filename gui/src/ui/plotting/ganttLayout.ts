/*---------------------------------------------------------------------------*\
  ganttLayout -- pure geometry for the batch campaign sequence (Gantt) plot.

  Lanes are the run's VESSELS (every unit the KPI table reports, in that
  order, plus any event-only unit appended by first appearance); each fired
  timeline event lands on its acting unit's lane (`from`), and a transfer
  additionally points at its destination lane (`to`).  Kept free of DOM/React
  so the mapping is unit-testable (the panelFold.ts twin).
\*---------------------------------------------------------------------------*/

import type { TimelineEvent } from "../../adapters/SolverAdapter.js";
import type { EnergyRow, EnergyScale } from "../../case/campaignLedger.js";
import { energyDirection, energyFraction } from "../../case/campaignLedger.js";

export interface GanttLane {
  unit: string;
  y: number;          // lane centre, px
}

export interface GanttMark {
  t: number;
  x: number;          // px
  lane: string;       // acting unit (from)
  laneY: number;      // px, centre of the acting lane
  toLane?: string;    // transfer destination
  toY?: number;       // px, centre of the destination lane
  tEnd?: number;      // continuous action: interval end (s)
  xEnd?: number;      // px of tEnd -- present iff tEnd > t (a duration bar)
  kind: "recipe" | "status";
  action: string;
  detail: string;
  trigger: string;
}

export const LANE_HEIGHT = 34;
export const LANE_TOP = 26;      // axis strip above the first lane
export const PLOT_LEFT = 130;    // room for lane labels
export const PLOT_RIGHT = 24;

/** Lane order: the CAMPAIGN'S STORY -- units in order of first appearance
 *  in the fired events (source before destination, events in time order),
 *  then any KPI vessel that never acted.  The "campaign" KPI bucket is the
 *  ledger's aggregate, not a vessel: it never gets a lane.  This keeps a
 *  transfer's arrow from crossing unrelated lanes (reactor -> still ->
 *  receiver reads top-to-bottom).  Never invents a lane for an empty name. */
export function ganttLanes(
  kpiUnits: string[],
  events: TimelineEvent[],
): string[] {
  const lanes: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    if (u && u !== "campaign" && !seen.has(u)) { seen.add(u); lanes.push(u); }
  };
  for (const e of events) { push(e.from); push(e.to); }
  for (const u of kpiUnits) push(u);
  return lanes;
}

/** Time span of the plot: [0, max(t_end KPI, last event)] with a 2 % pad;
 *  a degenerate span (all events at t = 0) widens to 1 s so marks render. */
export function ganttSpan(tEnd: number | undefined, events: TimelineEvent[]): number {
  let span = tEnd ?? 0;
  for (const e of events) span = Math.max(span, e.t, e.tEnd ?? 0);
  return span > 0 ? span * 1.02 : 1;
}

export function ganttMarks(
  events: TimelineEvent[],
  lanes: string[],
  span: number,
  plotWidth: number,
  //  THE MATERIAL BAND'S GEOMETRY IS UNCHANGED, and this parameter is how
  //  that stays true now that a lane may carry a second band beneath it.
  //  OMITTED, the lane centres are exactly the formula this function has
  //  always used, so a run with no energy ledger draws byte-identically --
  //  the project's own posture where a new declaration is added (a case that
  //  declares no utility circuit emits byte-identical JSON).  A caller that
  //  HAS energy rows supplies the map `ganttGeometry` computed.
  laneCentres?: Map<string, number>,
): GanttMark[] {
  const yOf = laneCentres ?? new Map<string, number>();
  if (!laneCentres)
    lanes.forEach((u, i) => yOf.set(u, LANE_TOP + LANE_HEIGHT * (i + 0.5)));
  const xOf = (t: number) => PLOT_LEFT + (t / span) * plotWidth;
  return events
    .filter((e) => yOf.has(e.from))
    .map((e) => ({
      t: e.t,
      x: xOf(e.t),
      lane: e.from,
      laneY: yOf.get(e.from)!,
      ...(e.to && yOf.has(e.to) ? { toLane: e.to, toY: yOf.get(e.to)! } : {}),
      // A CONTINUOUS action (engine tEnd > t) renders as a DURATION BAR on
      // the acting unit's lane, not an instantaneous mark -- the temporal
      // honesty of the sequence (Vitor's batch audit, Codex point 3).
      ...(e.tEnd !== undefined && e.tEnd > e.t
        ? { tEnd: e.tEnd, xEnd: xOf(e.tEnd) } : {}),
      kind: e.kind,
      action: e.action,
      detail: e.detail,
      trigger: e.trigger,
    }));
}

/*---------------------------------------------------------------------------*\
  THE SECOND BAND -- the vessel's ENERGY history, beneath its material lane.

  The material band above is the campaign's SEQUENCE: what moved, when, to
  where.  The energy band is what that vessel was DOING to its contents over
  the same axis -- boiling, condensing, reacting, adsorbing, losing heat
  through a wall.  The two share one time axis because they are one story;
  they are separate bands because they are different quantities and stacking
  a kJ on a kmol would be a chart that reads as a sum.

  A LANE WITH NO ENERGY RECORD GETS NO BAND AND NO HEIGHT.  Not an empty
  band: an empty band reads as "no heat", and "this vessel ledgers no energy
  segment" is a different fact.  Measured, that state is most of the corpus --
  `still06`'s recA/recB/dump/fresh/spike lanes carry material and no energy.
\*---------------------------------------------------------------------------*/

/** Height of the energy band under a lane that has one.  Bipolar: the
 *  baseline sits at its centre, so half of this is the full magnitude. */
export const ENERGY_BAND_HEIGHT = 30;

/** A tile narrower than this is unreadable, so a non-zero-duration record is
 *  widened to it.  An INSTANTANEOUS record (an impulse: tEnd === tStart) is
 *  drawn at exactly this width too, and SAYS it is instantaneous in the
 *  hover and by a different outline -- an impulse has energy and no modelled
 *  duration, and a tile wide enough to see must not also claim an interval. */
export const ENERGY_MIN_TILE_W = 3;

/** A non-zero |E| smaller than this fraction of the band still renders, so a
 *  tiny segment is VISIBLY TINY rather than invisible.  It is applied ONLY
 *  to a non-zero magnitude: a priced EXACT ZERO draws at zero height, because
 *  raising it here would make a measured zero look like a small duty, which
 *  is the `?? 0` fabrication wearing the opposite sign. */
export const ENERGY_MIN_BAR_H = 1.5;

export interface GanttLaneBox {
  unit: string;
  /** Top of the whole lane block (material band + any energy band). */
  top: number;
  /** Centre of the MATERIAL band -- where the diamonds, bars and arrows go. */
  centreY: number;
  /** Present iff this lane has at least one energy record.  `baselineY` is
   *  the zero line; a positive E draws UP from it, a negative one DOWN. */
  energyTop?: number;
  energyBaselineY?: number;
  energyBottom?: number;
  /** Bottom of the whole lane block -- the next lane's `top`. */
  bottom: number;
}

export interface GanttGeometry {
  boxes: GanttLaneBox[];
  /** unit -> material-band centre, the map `ganttMarks` takes. */
  laneCentres: Map<string, number>;
  /** Bottom of the last lane block (the axis label goes below it). */
  contentBottom: number;
}

/** Stack the lanes, giving an energy band only to the units that have one.
 *
 *  WHEN NO UNIT HAS ENERGY ROWS this reproduces the pre-existing layout
 *  exactly: `centreY === LANE_TOP + LANE_HEIGHT * (i + 0.5)` for every lane,
 *  which is the formula `ganttMarks` uses when given no map.  That is
 *  asserted in the tests rather than argued here. */
export function ganttGeometry(
  lanes: string[],
  energyByUnit: Map<string, EnergyRow[]>,
): GanttGeometry {
  const boxes: GanttLaneBox[] = [];
  const laneCentres = new Map<string, number>();
  let y = LANE_TOP;
  for (const unit of lanes) {
    const hasEnergy = (energyByUnit.get(unit)?.length ?? 0) > 0;
    const centreY = y + LANE_HEIGHT / 2;
    const box: GanttLaneBox = {
      unit,
      top: y,
      centreY,
      bottom: y + LANE_HEIGHT + (hasEnergy ? ENERGY_BAND_HEIGHT : 0),
    };
    if (hasEnergy) {
      box.energyTop = y + LANE_HEIGHT;
      box.energyBaselineY = y + LANE_HEIGHT + ENERGY_BAND_HEIGHT / 2;
      box.energyBottom = y + LANE_HEIGHT + ENERGY_BAND_HEIGHT;
    }
    laneCentres.set(unit, centreY);
    boxes.push(box);
    y = box.bottom;
  }
  return { boxes, laneCentres, contentBottom: y };
}

export interface GanttEnergyTile {
  row: EnergyRow;
  x: number;
  width: number;
  /** Top edge of the drawn rectangle. */
  y: number;
  height: number;
  /** "up" = heat added, "down" = removed, "zero" = a priced exact zero (a
   *  tick on the baseline), "refused" = UNPRICEABLE: full band height,
   *  hatched, NO direction.  Unknown is not zero, and a zero-height bar at
   *  the baseline is exactly what zero looks like. */
  form: "up" | "down" | "zero" | "refused";
}

/** Place one lane's energy rows on the shared time axis.
 *
 *  Overlapping records on one lane are NOT dropped and NOT stacked: the
 *  corpus has them (a still's reboiler and condenser run over the same
 *  interval), their signs put them on opposite sides of the baseline, and
 *  where two of the same sign do overlap the caller draws them translucent
 *  so the overlap READS as an overlap.  Dropping one would be a lie about
 *  what the vessel did. */
export function ganttEnergyTiles(
  rows: EnergyRow[],
  box: GanttLaneBox,
  scale: EnergyScale,
  span: number,
  plotWidth: number,
): GanttEnergyTile[] {
  if (box.energyBaselineY === undefined || box.energyTop === undefined
      || box.energyBottom === undefined) return [];
  const baseline = box.energyBaselineY;
  const half = ENERGY_BAND_HEIGHT / 2;
  const xOf = (t: number) => PLOT_LEFT + (t / span) * plotWidth;
  return rows.map((row) => {
    const x = xOf(row.tStart);
    const rawW = xOf(row.tEnd) - x;
    const width = Math.max(ENERGY_MIN_TILE_W, rawW);
    const dir = energyDirection(row);
    if (dir === null) {
      //  REFUSED: the whole band, hatched, straddling the baseline so it
      //  cannot be read as pointing either way.
      return { row, x, width, y: box.energyTop!,
               height: ENERGY_BAND_HEIGHT, form: "refused" as const };
    }
    const f = energyFraction(row, scale);
    if (dir === 0 || f === null || f === 0)
      return { row, x, width, y: baseline, height: 0, form: "zero" as const };
    const h = Math.max(ENERGY_MIN_BAR_H, f * half);
    return dir > 0
      ? { row, x, width, y: baseline - h, height: h, form: "up" as const }
      : { row, x, width, y: baseline, height: h, form: "down" as const };
  });
}

/*  COLOUR IS THE RECORD'S `kind`, and the palette is DELIBERATELY OPEN.
 *
 *  The canon in `SimulationResult.H`'s comment -- reaction | sensible |
 *  latent | mixing | impulse | externalH | shaftWork | heatLoss -- is STALE,
 *  measured over the whole batch corpus on 2026-09-20: four kinds the engine
 *  writes are absent from it (`reboiler`, `condenser`, `adsorption`,
 *  `wallHeat`) and five of its words appear nowhere (`sensible`, `mixing`,
 *  `externalH`, `shaftWork`, `heatLoss`).  Nothing in the engine or the GUI
 *  reads it.
 *
 *  So this map is NOT a copy of that list -- it is keyed on the words the
 *  writers actually assign, and any kind it does not know gets a
 *  DETERMINISTIC fallback colour and appears in the legend under its own
 *  name.  A new kind therefore arrives drawn and named, never silently
 *  lumped into an "other" bucket and never producing a stale list here that
 *  a future reader has to re-measure.  That is why this slice adds no gate
 *  over the vocabulary: there is no closed list left to go stale. */
const KIND_COLOURS: { [kind: string]: string } = {
  reaction:   "#e8590c",
  reboiler:   "#c92a2a",
  condenser:  "#1971c2",
  adsorption: "#5f3dc4",
  latent:     "#0ca678",
  impulse:    "#f08c00",
  wallHeat:   "#868e96",
};

const FALLBACK_COLOURS = [
  "#2b8a3e", "#a61e4d", "#087f5b", "#5c940d", "#862e9c", "#495057",
];

/** Stable per-kind colour.  A known kind keeps its colour across runs; an
 *  unknown one is hashed into the fallback ring, so it is stable too and two
 *  unknown kinds in one run are (almost always) told apart. */
export function energyKindColour(kind: string): string {
  const known = KIND_COLOURS[kind];
  if (known !== undefined) return known;
  let h = 0;
  for (let i = 0; i < kind.length; i++) h = (h * 31 + kind.charCodeAt(i)) | 0;
  return FALLBACK_COLOURS[Math.abs(h) % FALLBACK_COLOURS.length]!;
}
