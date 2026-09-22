/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * dutyUtility -- what the duty stub says about who serves a duty.
 *
 * WHY THIS EXISTS.  Vítor, reading the flowsheet: the grey box at the bottom
 * carries an enormous comment.  It does -- the card was drawing
 *
 *     DUTY (carried: its own process streams (heatExchanger))
 *
 * a parenthetical inside a parenthetical, in a slot sized for `steamLP`.
 *
 * AND THE CAUSE IS A FACT THIS PROJECT ALREADY RULED ON.  The engine's
 * `UtilityAllocation.utility` is a NAME field that also carries PROSE when
 * there is no name to give: `r.utility = "(carried: " + carriedBy + ")"`
 * (src/reporting/UtilityAllocationReport.cpp:314).  On 2026-09-03 the record
 * gained a typed `carried` flag for exactly this reason, and said why in its
 * own words: *"prose is not a field a reader may test, so the golden format
 * pinned both as `unserved` and heatExchanger01 stood for a month as
 * 93.79 kW of UNSERVED HEATING."*
 *
 * The engine emits it (`ResultEmitter.cpp:664` writes `"carried": ...`).  The
 * GUI's `UtilityAllocationRow` never declared it, so the canvas had only the
 * prose to draw and drew it.  A typed fact published and not read is the same
 * defect as one never published, one surface along.
 *
 * THE RULE, and it is the same one D13 gave the case description an hour
 * earlier: THE CARD SHOWS A WORD, THE SENTENCE GOES TO THE TOOLTIP.  The word
 * is decided by the TYPED FLAGS and never by parsing the prose -- reading
 * `"(carried:"` off a string would be a second home for a fact the engine
 * already states, and it would go wrong the day the sentence is reworded.
 *
 * WHAT IT REFUSES TO INVENT.  A result written before the typed flag existed
 * has `allocated: false` and no `carried` at all, and from that alone the two
 * cases CANNOT be told apart -- a duty met by the unit's own streams and one
 * no utility can serve look identical.  It says `not allocated` and hands the
 * sentence over, rather than guessing which.  That is the honest reading of
 * an absent field, and it is why the word is not simply "unserved".
 */

/** What the engine's utilityAllocation row says, as far as this needs it. */
export interface DutyAllocationFacts {
  /** the engine's `utility` field: a catalogue name, or prose */
  utility?: string;
  /** typed: a catalogue utility was found and priced */
  allocated?: boolean;
  /** typed (since 2026-09-03): met by the unit's own streams / a heat link */
  carried?: boolean;
}

export type DutyServiceKind =
  | "allocated"     // a catalogue utility, named and priced
  | "carried"       // nothing to buy: the unit's own streams meet it
  | "unserved"      // no catalogue utility can meet it
  | "unknown"       // not allocated, and the run predates the typed flag
  | "declared";     // no run yet; the case named a utility on the port

export interface DutyUtilityLabel {
  /** the short word the card shows -- never a sentence */
  word: string;
  /** the whole thing, for the tooltip; null when the word IS the whole thing */
  detail: string | null;
  kind: DutyServiceKind;
}

/**
 * Decide what the duty stub says.
 *
 * `row` is the latest run's allocation for this duty (undefined before a run);
 * `declared` is the utility the case named on the port, which is what there is
 * to show until a run replaces it.
 *
 * Returns null when there is nothing to say -- no run and nothing declared --
 * so the caller draws no utility line at all rather than an empty one.
 */
export function dutyUtilityLabel(
  row: DutyAllocationFacts | undefined,
  declared?: string,
): DutyUtilityLabel | null {
  if (row) {
    const prose = (row.utility ?? "").trim();
    if (row.allocated) {
      //  An allocated row's `utility` IS a catalogue name.  It is shown whole:
      //  `steamLP` is not a sentence and folding it would hide the answer.
      return prose.length > 0
        ? { word: prose, detail: null, kind: "allocated" }
        : { word: "allocated", detail: null, kind: "allocated" };
    }
    if (row.carried === true) {
      return { word: "carried", detail: prose.length > 0 ? prose : null,
               kind: "carried" };
    }
    if (row.carried === false) {
      return { word: "unserved", detail: prose.length > 0 ? prose : null,
               kind: "unserved" };
    }
    //  The flag is ABSENT: a result written before it existed.  Carried and
    //  unserved are indistinguishable from here, and saying either would be
    //  inventing the one fact this label exists to carry.
    return { word: "not allocated", detail: prose.length > 0 ? prose : null,
             kind: "unknown" };
  }
  const d = (declared ?? "").trim();
  return d.length > 0 ? { word: d, detail: null, kind: "declared" } : null;
}
