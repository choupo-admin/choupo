/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * edgeDashes -- what a DASHED wire on the flowsheet means, in ONE home.
 *
 * WHY THIS EXISTS.  Vítor opened `plant/ammonia03_quench_converter` on the
 * live site and asked why some streams are dashed when they are not
 * utilities.  The drawing was right -- they are the two declared tear cuts,
 * `recycle` and `hotEffluent` -- and the question is the finding: the canvas
 * encodes SIX different facts in dash patterns whose only difference is the
 * length of the gaps, and the legend decodes NONE of them.  It lists the
 * phases present (colour + glyph) and the temperature/pressure scale, and
 * says nothing about strokes.  The author of the project could not read his
 * own plant; a student has no chance.
 *
 * It is the same defect as the first-law figure the day before: a drawing
 * carrying information the reader has no way to decode.
 *
 * THE RULE, and it is why this module is PURE rather than a few more lines
 * inside the canvas: the pattern that paints a wire and the swatch that
 * explains it must come from ONE table.  Two homes for "what a dash means"
 * drift the first time somebody changes a gap length, and the legend then
 * lies with total confidence.  There is no React render harness in this
 * repository, so a decision left inside the canvas's `useMemo` is invisible
 * to every test here -- which is exactly how two defects reached the site
 * this week.  Here it is testable.
 *
 * PRECEDENCE IS PART OF THE MEANING.  An edge can satisfy more than one
 * predicate at once -- a tear that carries no flow is both empty and a tear.
 * The canvas resolved this by the ORDER ITS SPREADS APPEARED IN, which is a
 * rule nobody can read off the screen.  It is written down here instead, and
 * it is the order of the table below.  A heat link is an energy wire before
 * it is anything else; a recycle cut is a recycle cut even when this run
 * happens to send nothing round it.
 *
 * TWO PATTERNS ARE AMBIGUOUS, and writing the table down is what found it.
 * The vocabulary is SIX facts, not four, and two pairs share a stroke:
 *
 *     4 4   empty pipe (phase colour, dimmed)   AND   recipe transfer (teal)
 *     6 3   plant utility (phase colour)        AND   utility duty (orange
 *                                                     heating / cyan cooling)
 *
 * Within each pair the COLOUR separates them, so nothing on screen is
 * actually undecidable -- but the pattern alone is not the fact, and any
 * reader (or any future edit) that treats it as one will be wrong.  The
 * legend therefore shows the colour beside the pattern.  Whether the
 * patterns themselves should be made distinct is a DESIGN decision that
 * changes how every case in the corpus looks, and it is Vítor's, not this
 * module's: it is recorded here rather than taken.
 */

/** The fact a dash pattern states.  `process` is the undashed default. */
export type DashKind =
  | "energy" | "tear" | "utility" | "duty" | "recipe" | "empty" | "process";

export interface DashSpec {
  kind: DashKind;
  /** SVG stroke-dasharray, or null for a solid line. */
  dash: string | null;
  /** extra transparency the canvas applies with the pattern, 1 = none */
  opacity: number;
  /** the legend's word for it -- short, because it sits in a 10px chip */
  label: string;
  /** what it tells the reader, for the legend's title attribute */
  meaning: string;
  /**
   * The fixed colour this kind is drawn in, where it HAS one.  Absent means
   * the wire keeps its phase colour, which is the semantic the canvas
   * refuses to repaint -- so the legend must not claim a colour either.
   */
  colour?: string;
}

/**
 * The table.  ORDER IS THE PRECEDENCE, most specific first; it is also the
 * order the legend lists them in, so the two can never disagree about which
 * fact wins.
 */
export const DASH_KINDS: readonly DashSpec[] = [
  {
    kind: "energy",
    dash: "6 4",
    opacity: 1,
    label: "energy",
    meaning: "a heat link, not a pipe: energy crosses here, matter does not",
  },
  {
    kind: "tear",
    dash: "10 5",
    opacity: 1,
    label: "recycle cut",
    meaning:
      "a tear stream the solver cuts to break a loop, declared in"
      + " system/solverDict; the long dash marks the back edge",
  },
  {
    kind: "utility",
    dash: "6 3",
    opacity: 0.85,
    label: "utility",
    meaning:
      "a plant utility (steam header, cooling water, refrigerant), not"
      + " process material",
  },
  {
    kind: "duty",
    dash: "6 3",
    opacity: 1,
    //  SHARES `6 3` with `utility` and is told apart by colour: orange when
    //  the duty heats, cyan when it cools (toGraph.ts).
    colour: "#e8590c",
    label: "duty",
    meaning:
      "a utility DUTY served to a unit -- orange heating, cyan cooling;"
      + " same dash as a utility stream, separated by colour",
  },
  {
    kind: "recipe",
    dash: "4 4",
    opacity: 1,
    //  SHARES `4 4` with `empty`; teal is what separates them.
    colour: "#20c997",
    label: "recipe transfer",
    meaning:
      "a batch recipe moving material between vessels at a scheduled"
      + " instant; same dash as an empty pipe, separated by colour",
  },
  {
    kind: "empty",
    dash: "4 4",
    opacity: 0.55,
    label: "empty",
    meaning: "this pipe carries no flow in the current run",
  },
  {
    kind: "process",
    dash: null,
    opacity: 1,
    label: "process",
    meaning: "process material; the colour is its phase",
  },
] as const;

const BY_KIND = new Map(DASH_KINDS.map((d) => [d.kind, d]));

export function dashSpec(kind: DashKind): DashSpec {
  const hit = BY_KIND.get(kind);
  //  A kind outside the table is a programming error, not a drawing state:
  //  falling back to `process` would paint an unknown fact as an ordinary
  //  pipe, which is the silent-default this project refuses everywhere else.
  if (!hit) throw new Error(`edgeDashes: no spec for dash kind '${kind}'`);
  return hit;
}

/** What an edge IS, resolved by the precedence above. */
export function dashKindOf(f: {
  isEnergy?: boolean;
  isDuty?: boolean;
  isRecipe?: boolean;
  isTear?: boolean;
  isUtility?: boolean;
  isEmpty?: boolean;
}): DashKind {
  if (f.isEnergy) return "energy";
  if (f.isDuty) return "duty";
  if (f.isRecipe) return "recipe";
  if (f.isTear) return "tear";
  if (f.isUtility) return "utility";
  if (f.isEmpty) return "empty";
  return "process";
}

/** The stroke properties for a kind, ready to spread into an SVG style. */
export function dashStyle(kind: DashKind): { strokeDasharray?: string; opacity?: number } {
  const s = dashSpec(kind);
  const out: { strokeDasharray?: string; opacity?: number } = {};
  if (s.dash !== null) out.strokeDasharray = s.dash;
  if (s.opacity !== 1) out.opacity = s.opacity;
  return out;
}

/**
 * The legend's rows: the kinds PRESENT in this run, in table order.
 *
 * `process` is deliberately excluded -- a solid line is the default and a
 * legend that explains the absence of a pattern is noise.  This mirrors the
 * phase legend beside it, which lists only the phases the run produced: a
 * plant with no utilities gets no "utility" row, and the reader learns that
 * the vocabulary is about THIS plant rather than about the software.
 */
export function legendDashes(present: Iterable<DashKind>): DashSpec[] {
  const have = new Set(present);
  return DASH_KINDS.filter((d) => d.kind !== "process" && have.has(d.kind));
}
