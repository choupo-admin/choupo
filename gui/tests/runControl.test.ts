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

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { runControl, type RunControlInputs } from "../src/case/runControl.js";

const at = (p: Partial<RunControlInputs>): RunControlInputs => ({
  phase: "idle", haveResult: false, stale: false, pendingEdits: 0, ...p,
});

describe("runControl: the badge and the button are one fact", () => {
  it("idle: nothing has run, so there is NO badge to draw", () => {
    const c = runControl(at({}));
    expect(c.state).toBe("idle");
    expect(c.variant).toBe("filled");
    expect(c.badge).toBeNull();
  });

  it("running: red Stop, and no badge about a result mid-flight", () => {
    const c = runControl(at({ phase: "running", haveResult: true }));
    expect(c.state).toBe("running");
    expect(c.label).toBe("Stop");
    expect(c.badge).toBeNull();
  });

  it("current: de-emphasised button, teal badge", () => {
    const c = runControl(at({ phase: "done", haveResult: true }));
    expect(c.state).toBe("current");
    expect(c.variant).toBe("default");
    expect(c.badge?.color).toBe("teal");
    expect(c.badge?.text).toBe("Latest run loaded");
  });

  it("stale: orange button AND orange badge -- one fact, one colour", () => {
    const c = runControl(at({ phase: "done", haveResult: true, stale: true, pendingEdits: 3 }));
    expect(c.state).toBe("stale");
    expect(c.color).toBe("orange");
    expect(c.badge?.color).toBe("orange");
    expect(c.label).toContain("3 pending edits");
  });

  it("stale with ZERO pending edits is a real state and says so", () => {
    //  The case FILES moved under an unmoved overlay.  The control must not
    //  claim a count it does not have.
    const c = runControl(at({ phase: "done", haveResult: true, stale: true, pendingEdits: 0 }));
    expect(c.label).toBe("Run flowsheet (case changed)");
  });

  it("one pending edit is singular", () => {
    const c = runControl(at({ phase: "done", haveResult: true, stale: true, pendingEdits: 1 }));
    expect(c.label).toContain("1 pending edit)");
  });
});

describe("runControl: THE DEFECT -- a failed run must not be reported as a success", () => {
  it("failed WITH a previous result still loaded draws NO success badge", () => {
    //  This is the exact shape that was on screen: `failRun` leaves the
    //  previous `runResult` in place, so `haveResult` is true and the old
    //  badge condition (`runStatus !== "running" && result.status === "done"`)
    //  was satisfied -- and the canvas said "Latest run loaded" about a run
    //  the student had already replaced.
    const c = runControl(at({ phase: "error", haveResult: true }));
    expect(c.state).toBe("failed");
    expect(c.badge?.color).toBe("red");
    expect(c.badge?.text).not.toContain("Latest run loaded");
    expect(c.badge?.text).toContain("Log");
    //  And it says, in words, that what is drawn is not from this attempt.
    expect(c.badge?.title).toContain("earlier run");
  });

  it("FAILED OUTRANKS STALE: both can be true and the newer fact wins", () => {
    //  Edit something, run, it fails.  Reporting "stale" there describes the
    //  older fact while the newer one -- that the engine refused -- goes
    //  unmentioned.
    const c = runControl(at({ phase: "error", haveResult: true, stale: true, pendingEdits: 2 }));
    expect(c.state).toBe("failed");
    expect(c.badge?.color).toBe("red");
  });

  it("failed with NO previous result still refuses to claim success", () => {
    const c = runControl(at({ phase: "error", haveResult: false }));
    expect(c.state).toBe("failed");
    expect(c.badge?.color).toBe("red");
  });

  it("the button stays pressable and its label is an ACTION", () => {
    //  A control labelled only with a diagnosis leaves the reader wondering
    //  what pressing it does.
    const c = runControl(at({ phase: "error", haveResult: true }));
    expect(c.label).toContain("run again");
    expect(c.variant).toBe("outline");
  });

  it("NO STATE IS GREEN -- two facts must not share one channel", () => {
    const every: RunControlInputs[] = [
      at({}), at({ phase: "running" }),
      at({ phase: "done", haveResult: true }),
      at({ phase: "done", haveResult: true, stale: true }),
      at({ phase: "error", haveResult: true }),
    ];
    for (const i of every) {
      const c = runControl(i);
      expect(c.color, c.state).not.toBe("green");
      expect(c.badge?.color ?? "", c.state).not.toBe("green");
    }
  });

  it("every one of the five states is reachable, and they are distinct", () => {
    const seen = new Set([
      runControl(at({})).state,
      runControl(at({ phase: "running" })).state,
      runControl(at({ phase: "done", haveResult: true })).state,
      runControl(at({ phase: "done", haveResult: true, stale: true })).state,
      runControl(at({ phase: "error", haveResult: true })).state,
    ]);
    expect([...seen].sort())
      .toEqual(["current", "failed", "idle", "running", "stale"]);
  });
});

/*  ---- THE SOURCE ARM -------------------------------------------------------
 *  The badge and the button drifted apart because each computed the answer
 *  for itself.  This requires the canvas to read the one home, and forbids
 *  the condition that produced the false claim.  */
describe("the canvas reads the one home", () => {
  const src = (): string =>
    readFileSync("src/ui/FlowCanvas.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

  it("FlowCanvas calls runControl", () => {
    expect(src()).toContain("runControl(");
  });

  it("the badge is no longer GATED on the condition a failure satisfies", () => {
    //  A PATTERN MUST NAME ITS SUBJECT.  The first draft of this arm forbade
    //  the bare expression `runResult?.status === "done"` and duly failed on
    //  the line that FEEDS the one home -- `haveResult:` in the derivation,
    //  which is the correct use.  The defect was never the expression; it was
    //  the expression IN A GATING POSITION beside `runStatus !== "running"`.
    //  (Second time today that an arm matched something other than the thing
    //  it is about; the other was a comment.)
    expect(src().replace(/\s+/g, " "))
      .not.toContain('runStatus !== "running" && runResult?.status === "done"');
  });

  it("the badge renders from the one home and nothing else", () => {
    expect(src().replace(/\s+/g, " ")).toContain("{rc.badge && (");
  });
});
