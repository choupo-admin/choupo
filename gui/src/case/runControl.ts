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
  runControl — WHAT THE RUN CONTROL AND THE RESULT BADGE ARE ALLOWED TO CLAIM.

  THE DEFECT THIS EXISTS TO END.  `failRun` sets `runStatus: "error"` and
  leaves the previous `runResult` in place -- correctly, because a reader may
  still want the last answer.  But the canvas badge rendered on
  `runStatus !== "running" && runResult?.status === "done"`, which is TRUE
  after a failure: the previous result is still there and still says "done".
  So a run that FAILED drew the teal "Latest run loaded" badge about a run the
  student had already replaced, with the only notice of the failure being a
  toast that had since vanished.  THE SCREEN MADE A FALSE CLAIM, and it is the
  same family as everything else this week -- a surface reporting an absence,
  or a success, that it never established.

  FIVE STATES, ONE HOME.  The badge and the button are two views of ONE fact
  and were computed separately, which is how they came to disagree:

      idle     never run           filled accent   -- this IS the thing to do
      running  in flight           red Stop
      current  result, up to date  default         -- done; re-running is
                                                     available, not urgent
      stale    case moved since    orange filled   -- needed again, and ORANGE
                                                     because that is already
                                                     the stale badge's colour
      failed   last run failed     red outline     -- and NO success badge

  WHY `failed` OUTRANKS `stale`.  A failed run is a fact about the LAST
  ATTEMPT; staleness is a fact about the DRAWN RESULT.  Both can be true at
  once (edit something, run, it fails).  The failure is the newer and the more
  urgent of the two, and a control that said "stale" there would be describing
  the older fact while the newer one -- that the engine refused -- goes
  unmentioned.

  GREEN IS REFUSED, deliberately.  A green "success" state would put two facts
  in one channel: green-vs-grey would mean succeeded-vs-not while
  accent-vs-orange already means current-vs-stale, and a reader cannot decode
  two meanings from one colour.  Grey already says "what you see is current",
  which is the whole of the good news.

  WHAT THIS DOES NOT COVER, named rather than implied.  The Props workspace
  and the Control workspace have Run buttons too, and a read of them shows
  they are NOT this state wearing other hats: each drives a DIFFERENT binary
  (`choupoProps`, the control loop) off its own local `running` / `busy` flag,
  with no `runResult` and no staleness behind it.  What they share with this
  one is a COLOUR LITERAL, not a state machine -- so folding them in here
  would be forcing one vocabulary onto three different questions, which is the
  opposite of one home per fact.  Their colour inconsistency (`cyan` in one,
  `accent` in the other) is a real but separate and much smaller question.
\*---------------------------------------------------------------------------*/

/** The store's run lifecycle.  Mirrors `RunStatus` without importing the
 *  store, so this module stays pure and testable without a browser. */
export type RunPhase = "idle" | "running" | "done" | "error";

export type RunControlState =
  "idle" | "running" | "current" | "stale" | "failed";

export interface RunControl {
  state: RunControlState;
  /** Mantine colour for the Run button. */
  color: string;
  /** Mantine variant for the Run button. */
  variant: "filled" | "default" | "outline";
  label: string;
  title: string;
  /** The badge beside it, or null when there is nothing truthful to say.
   *  NULL IS A RESULT: an idle case has no run to describe, and a failed one
   *  must not be described by the previous run's success. */
  badge: { color: string; text: string; title: string } | null;
}

export interface RunControlInputs {
  /** The store's `runStatus`. */
  phase: RunPhase;
  /** True when a result is loaded and its own status is "done". */
  haveResult: boolean;
  /** From `useStaleResult` — the drawn result does not answer what is
   *  declared now. */
  stale: boolean;
  /** How many scratch knobs differ from the ones the run was given. */
  pendingEdits: number;
}

export function runControl(i: RunControlInputs): RunControl {
  if (i.phase === "running")
    return {
      state: "running", color: "red", variant: "filled",
      label: "Stop", title: "Stop the running simulation",
      badge: null,
    };

  //  FAILED OUTRANKS EVERYTHING BELOW IT, including `stale`: it is the newer
  //  fact and the one the reader has to act on.  Note this branch does NOT
  //  require `haveResult` to be false -- the previous result is still drawn,
  //  deliberately, and that is exactly why the badge must not call it the
  //  latest run.
  if (i.phase === "error")
    return {
      state: "failed", color: "red", variant: "outline",
      label: "Run failed — run again",
      title: "The last run did not finish; the Log workspace has the engine's "
        + "own message. Anything drawn is from an EARLIER run.",
      badge: {
        color: "red", text: "Run failed — see Log",
        title: "The last run did not finish. Any result drawn is from an "
          + "earlier run, not from this attempt.",
      },
    };

  if (!i.haveResult)
    return {
      state: "idle", color: "accent", variant: "filled",
      label: "Run flowsheet",
      title: "Run the flowsheet simulation (choupoSolve)",
      badge: null,
    };

  if (i.stale)
    return {
      state: "stale", color: "orange", variant: "filled",
      //  The COUNT is of pending EDITS, never of stale numbers: this knows
      //  what a student moved, not which results it touched.  With 0 edits
      //  and `stale` true the case FILES moved under an unmoved overlay, and
      //  the control then says so rather than claiming a count it lacks.
      label: i.pendingEdits > 0
        ? `Run flowsheet (${i.pendingEdits} pending edit${i.pendingEdits === 1 ? "" : "s"})`
        : "Run flowsheet (case changed)",
      title: "The drawn result does not include what is declared now — run to "
        + "bring it up to date",
      badge: {
        color: "orange", text: "Result is stale",
        title: "The case has changed since this result was computed — the "
          + "dimmed numbers answer the previous question",
      },
    };

  return {
    state: "current", color: "accent", variant: "default",
    label: "Run flowsheet",
    title: "Run the flowsheet simulation (choupoSolve)",
    badge: {
      color: "teal", text: "Latest run loaded",
      title: "This result was computed from the case as it is declared now",
    },
  };
}
