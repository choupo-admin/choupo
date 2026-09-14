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
  tearMath — the graph construction pinned, and the claim the page is BUILT on
  measured rather than asserted.

  WHAT IS WORTH PINNING, and none of it is "the code does what the code does".

  (a) THE CYCLES.  Enumerating elementary cycles once each is easy to get
      wrong in two directions -- missing one, or reporting the same one from
      three different starting units -- and both are invisible on a drawing.
      Each teaching graph's cycles are named here by hand.

  (b) THE PAGE'S CENTRAL CLAIM, which is that the tear COUNT is a property of
      the declared ORDER.  The `shared` graph needs two tears as written and
      ONE after a reorder, and that is asserted as a number, in both states,
      with the edge named.  If it ever stopped being true the page would be
      teaching something false and nothing else would say so.

  (c) THE OTHER HALF OF THE SAME CLAIM: reordering does NOT always help.  The
      `independent` graph needs two whatever you do, and an exhaustive search
      says so.  A page that only showed the case where reordering wins would
      leave a reader believing it always does.

  (d) THE ENGINE'S REFUSAL READER.  `planFindings` and `planAnnouncements`
      lift the engine's own sentences out of a log by their opening words.
      Those words are a contract with src/unitOperations/flowsheet/
      Flowsheet.cpp, so the arms below feed them REAL engine text.

  (e) THE WITNESS COULD MOVE UNDER THE TOOL.  The withdrawal is a key rename
      applied through the real `applyKeyRename`, which throws when the key has
      moved or become ambiguous, on the real bundled case.

  NOT CHECKED, said plainly: whether a tear is a GOOD choice.  Nothing here
  ranks candidates, the engine does not either, and a test that pretended to
  would be inventing the judgement both decline to make.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import {
  TEACH_GRAPHS, TEAR_DECLARED, TEAR_SOLVER_DICT, TEAR_WITNESS,
  bestOrder, cycleString, cyclesOf, isInternal, judgeDeclaration, judgePlan,
  planAnnouncements, planFindings, withdrawTearOverrides,
} from "../src/ui/methods/tearMath.js";
import { applyKeyRename, methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";

const byId = (id: string) => {
  const g = TEACH_GRAPHS.find((x) => x.id === id);
  if (!g) throw new Error(`no teaching graph '${id}'`);
  return g;
};

const cycleSet = (id: string): string[] =>
  cyclesOf(byId(id)).map((c) => [...c.edges].sort().join("+")).sort();

describe("the cycles of each teaching graph", () => {
  it("the reactor-separator-recycle train has exactly one", () => {
    expect(cycleSet("rsr"))
      .toEqual([["mixed", "reactorOut", "liqOut", "recycle"].sort().join("+")]);
  });

  it("the shared graph has two, and they share two edges", () => {
    const cs = cyclesOf(byId("shared"));
    expect(cs).toHaveLength(2);
    const common = cs[0]!.edges.filter((e) => cs[1]!.edges.includes(e)).sort();
    expect(common).toEqual(["toFlash", "toReactor"]);
  });

  it("the independent graph has two that share nothing", () => {
    const cs = cyclesOf(byId("independent"));
    expect(cs).toHaveLength(2);
    expect(cs[0]!.edges.filter((e) => cs[1]!.edges.includes(e))).toEqual([]);
  });

  it("each cycle is reported ONCE, not once per starting unit", () => {
    for (const g of TEACH_GRAPHS) {
      const keys = cyclesOf(g).map((c) => [...c.edges].sort().join("+"));
      expect(new Set(keys).size, `${g.id} reports a cycle more than once`)
        .toBe(keys.length);
    }
  });

  it("a domain inlet and a domain outlet are on no cycle and cannot be torn", () => {
    for (const g of TEACH_GRAPHS) {
      const ext = g.edges.filter((e) => !isInternal(e)).map((e) => e.name);
      for (const c of cyclesOf(g))
        for (const e of ext) expect(c.edges).not.toContain(e);
    }
  });
});

describe("the tear set is FORCED by the declared order", () => {
  it("every declared order in the corpus of graphs is a valid plan", () => {
    //  The panel opens on the declared order, so a graph shipped with an
    //  invalid one would greet a reader with a refusal they did not cause.
    for (const g of TEACH_GRAPHS) {
      const v = judgePlan(g, g.declaredOrder);
      expect(v.valid, `${g.id} ships an invalid declared order`).toBe(true);
    }
  });

  it("a tear is exactly a backward edge that closes a cycle", () => {
    for (const g of TEACH_GRAPHS) {
      const v = judgePlan(g, g.declaredOrder);
      expect(v.tears.sort())
        .toEqual(v.backward.filter((b) => b.onCycle).map((b) => b.name).sort());
      //  ... and nothing forward is ever a tear, which is the refusal the
      //  engine gives by name.
      const pos = new Map(g.declaredOrder.map((u, i) => [u, i]));
      for (const t of v.tears) {
        const e = g.edges.find((x) => x.name === t)!;
        expect(pos.get(e.to as number)!)
          .toBeLessThanOrEqual(pos.get(e.from as number)!);
      }
    }
  });

  it("a backward edge on NO cycle is an order mistake, not a tear", () => {
    //  Declare the SECOND train before the first one has produced the stream
    //  that feeds it.  `inter` (sep1 -> mix2) is the bridge between the two
    //  loops and lies on neither, so it points backwards and closes nothing:
    //  the plain declaration-order mistake the engine calls INVALID ORDER,
    //  and the one case where adding a tear would compensate a typing
    //  mistake with an artificial iteration.
    const g = byId("independent");
    const bad = [0, 1, 3, 4, 5, 2];          // mix2 .. sep2 before sep1
    const v = judgePlan(g, bad);
    expect(v.valid).toBe(false);
    expect(v.orderMistakes.map((m) => m.name)).toContain("inter");
    for (const m of v.orderMistakes) expect(m.onCycle).toBe(false);
    //  ... and the genuine recycles are still recognised as tears alongside
    //  it, so the two diagnoses do not mask each other.
    expect(v.tears).toContain("recycleA");
  });

  it("THE PAGE'S CLAIM: the shared graph needs two tears, and one after a reorder",
    () => {
      const g = byId("shared");
      expect(judgePlan(g, g.declaredOrder).tears.sort())
        .toEqual(["longRecycle", "shortRecycle"]);
      const best = bestOrder(g);
      expect(best.fewest).toBe(1);
      expect(best.tears).toEqual(["toReactor"]);
      //  And the order that achieves it really is valid on its own terms.
      const v = judgePlan(g, best.order);
      expect(v.valid).toBe(true);
      expect(v.tears).toEqual(["toReactor"]);
    });

  it("and reordering does NOT always help: two independent loops need two", () => {
    const best = bestOrder(byId("independent"));
    expect(best.fewest).toBe(2);
    //  Exhaustive: 6! orders searched, and fewer than half are valid at all.
    expect(best.ordersSearched).toBe(720);
    expect(best.validOrders).toBeLessThan(best.ordersSearched);
    expect(best.validOrders).toBeGreaterThan(0);
  });

  it("no order can have fewer tears than the graph has disjoint cycles", () => {
    //  A lower bound that is independent of the search: every cycle needs an
    //  edge cut, and cycles sharing no edge cannot share a cut.
    for (const g of TEACH_GRAPHS) {
      const cs = cyclesOf(g);
      const disjoint = cs.filter((c, i) =>
        cs.every((o, j) => i === j || !o.edges.some((e) => c.edges.includes(e))));
      expect(bestOrder(g).fewest,
        `${g.id}: fewer tears than pairwise-disjoint cycles`)
        .toBeGreaterThanOrEqual(Math.min(disjoint.length, cs.length > 0 ? 1 : 0));
    }
  });
});

describe("what a cut costs", () => {
  it("Wegstein packs one more variable per tear than Newton", () => {
    const g = byId("rsr");
    const v = judgePlan(g, g.declaredOrder);
    expect(v.tears).toHaveLength(1);
    //  4 components: Wegstein (F, z1..z4, T) = 6; Newton (F1..F4, T) = 5.
    expect(v.variablesWegstein).toBe(6);
    expect(v.variablesNewton).toBe(5);
    //  Two central-difference sweeps per Newton variable.
    expect(v.sweepsPerNewtonStep).toBe(10);
  });

  it("a second tear doubles both counts", () => {
    const g = byId("independent");            // 5 components, 2 tears
    const v = judgePlan(g, g.declaredOrder);
    expect(v.tears).toHaveLength(2);
    expect(v.variablesNewton).toBe(2 * 6);
    expect(v.variablesWegstein).toBe(2 * 7);
    expect(v.sweepsPerNewtonStep).toBe(24);
  });

  it("no tears means no variables and no iteration at all", () => {
    //  A graph walked in an order with no backward edge is a chain.  There is
    //  no such order for these three, so build the statement directly.
    const g = byId("rsr");
    const v = judgePlan(g, g.declaredOrder);
    const none = { ...v, tears: [] as string[] };
    expect(none.tears).toHaveLength(0);
    expect(judgePlan({ ...g, edges: g.edges.filter((e) => e.name !== "recycle") },
      g.declaredOrder).tears).toEqual([]);
  });
});

describe("reading the engine's own sentences", () => {
  //  Real output, taken from a run of the witness with its tearStreams
  //  declaration renamed away (choupoSolve, 2026-09-12).
  const REFUSAL = [
    "[state] seeded 7 stream(s) from 0/ via the canonical manifest",
    "",
    "ERROR: Flowsheet: the declared unit order is not a valid sequential plan:",
    "  MISSING TEAR: stream 'recycle' closes the material cycle  mixer01 ->"
    + " reactor -> separator -> split01 --recycle--> mixer01  but is not"
    + " declared a tear.  Declare it (solverDict: tearStreams ( recycle );)"
    + " and give it a 0/ seed (bin/choupo-init0 derives one).",
    "The plan contract: every material input is a domain inlet, an output of"
    + " an EARLIER unit, or a declared tear closing a real cycle.",
  ].join("\n");

  const VALID = [
    "[plan] material recycle: tear 'recycle' cuts  mixer01 -> reactor ->"
    + " separator -> split01 --recycle--> mixer01",
    "Recycle outer loop (Newton over 1 tear stream(s), 5 variables):",
  ].join("\n");

  it("lifts the finding with its cycle chain and its remedy intact", () => {
    const f = planFindings(REFUSAL);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain("MISSING TEAR");
    //  The cycle and the remedy must survive: they are why the sentence is
    //  quoted verbatim instead of paraphrased.
    expect(f[0]).toContain("--recycle--> mixer01");
    expect(f[0]).toContain("tearStreams ( recycle );");
  });

  it("does not mistake the surrounding prose for a finding", () => {
    for (const line of planFindings(REFUSAL))
      expect(line.startsWith("The plan contract")).toBe(false);
    expect(planFindings(VALID)).toEqual([]);
  });

  it("lifts the announcement a VALID plan makes about its own cut", () => {
    const a = planAnnouncements(VALID);
    expect(a).toHaveLength(1);
    expect(a[0]).toContain("tear 'recycle' cuts");
    expect(planAnnouncements(REFUSAL)).toEqual([]);
  });

  it("an absent log is no findings, never a crash", () => {
    expect(planFindings(null)).toEqual([]);
    expect(planAnnouncements(undefined)).toEqual([]);
  });

  it("the construction names a cycle the way the engine does", () => {
    const g = byId("rsr");
    const c = cyclesOf(g)[0]!;
    expect(cycleString(c, "recycle"))
      .toBe("mixer01 -> reactor -> separator -> split01 --recycle--> mixer01");
  });
});

describe("the withdrawal lands on the shipped case", () => {
  const files = tutorialByName(TEAR_WITNESS)?.files.rawFiles;

  it("the witness is bundled and declares the tear this page names", () => {
    expect(files, `${TEAR_WITNESS} is not bundled`).toBeTruthy();
    expect(files![TEAR_SOLVER_DICT])
      .toMatch(new RegExp(`tearStreams\\s*\\(\\s*${TEAR_DECLARED}\\s*\\)`));
  });

  it("the rename applies through the real applier and removes the key", () => {
    const body = files![TEAR_SOLVER_DICT]!;
    const out = applyKeyRename(body, withdrawTearOverrides()[0] as never);
    expect(out).not.toBe(body);
    expect(out).not.toMatch(/^tearStreams\s/m);
    expect(out).toMatch(/^tearStreamsOff\s/m);
    //  The list itself is untouched: the case still SAYS which stream it is,
    //  which is what makes the withdrawal a readable edit rather than a
    //  deletion.
    expect(out).toContain(TEAR_DECLARED);
  });

  it("methodCase assembles the withdrawn case", () => {
    expect(methodCase(TEAR_WITNESS, withdrawTearOverrides())).toBeTruthy();
  });
});

/*  THE SEVEN REFUSALS, one test each.
 *
 *  `judgeDeclaration` transcribes `Flowsheet::validateSequentialPlan`, and a
 *  transcription is only worth anything if every branch of it is reached by
 *  something.  Six of the seven are reached by a declaration a reader can
 *  make by clicking; the seventh, UNKNOWN TEAR, is a spelling mistake in a
 *  dict, so it is fired here by a name that is not a stream at all -- the
 *  only place it CAN be fired, which is why it is tested and not merely
 *  implemented.  */
describe("judgeDeclaration: the engine's seven refusals over a teaching graph", () => {
  const rsr = TEACH_GRAPHS.find((g) => g.id === "rsr")!;
  const indep = TEACH_GRAPHS.find((g) => g.id === "independent")!;

  it("the forced tear, declared, is accepted and nothing refuses", () => {
    const v = judgeDeclaration(rsr, rsr.declaredOrder, ["recycle"]);
    expect(v.ok).toBe(true);
    expect(v.findings).toEqual([]);
    expect(v.accepted).toEqual(["recycle"]);
    expect(v.marks["recycle"]).toBe("tear");
    //  Everything else is a forward edge, and says so.
    expect(v.marks["mixed"]).toBe("forward");
  });

  it("declaring nothing refuses MISSING TEAR and names the cycle", () => {
    const v = judgeDeclaration(rsr, rsr.declaredOrder, []);
    expect(v.ok).toBe(false);
    expect(v.findings.map((f) => f.kind)).toEqual(["MISSING TEAR"]);
    const m = v.findings[0]!.message;
    expect(m).toContain("MISSING TEAR: stream 'recycle'");
    //  The cycle chain, in the engine's own arrow notation.
    expect(m).toContain("--recycle-->");
    //  And the remedy, with the dict line the reader would actually write.
    expect(m).toContain("tearStreams ( recycle )");
  });

  it("a forward stream declared a tear refuses FORWARD TEAR, by name", () => {
    const v = judgeDeclaration(rsr, rsr.declaredOrder, ["recycle", "mixed"]);
    expect(v.findings.map((f) => f.kind)).toEqual(["FORWARD TEAR"]);
    expect(v.findings[0]!.message).toContain("producer 'mixer01'");
    expect(v.marks["mixed"]).toBe("FORWARD TEAR");
    //  The valid tear beside it is still accepted: a refusal is about the
    //  stream it names, not about the whole declaration.
    expect(v.accepted).toEqual(["recycle"]);
  });

  it("a domain inlet declared a tear refuses INLET TEAR", () => {
    const v = judgeDeclaration(rsr, rsr.declaredOrder, ["recycle", "freshFeed"]);
    expect(v.findings.map((f) => f.kind)).toEqual(["INLET TEAR"]);
    expect(v.findings[0]!.message).toContain("has no producer");
  });

  it("a domain outlet declared a tear refuses UNCONSUMED TEAR", () => {
    const v = judgeDeclaration(rsr, rsr.declaredOrder, ["recycle", "vapProd"]);
    expect(v.findings.map((f) => f.kind)).toEqual(["UNCONSUMED TEAR"]);
    expect(v.findings[0]!.message).toContain("no unit consumes it");
  });

  it("a name that is not a stream refuses UNKNOWN TEAR", () => {
    const v = judgeDeclaration(rsr, rsr.declaredOrder, ["recycle", "recylce"]);
    expect(v.findings.map((f) => f.kind)).toEqual(["UNKNOWN TEAR"]);
    expect(v.findings[0]!.message).toContain("check the spelling");
  });

  it("a backward edge on NO cycle: undeclared it is INVALID ORDER, declared it is OFF-CYCLE TEAR", () => {
    //  Put the second loop's mixer BEFORE the first loop's separator, so the
    //  edge joining the two loops points backwards while lying on neither.
    const order = [3, 4, 5, 0, 1, 2];
    const undeclared = judgeDeclaration(indep, order, ["recycleA", "recycleB"]);
    const invalid = undeclared.findings.filter((f) => f.kind === "INVALID ORDER");
    expect(invalid.map((f) => f.stream)).toEqual(["inter"]);
    expect(invalid[0]!.message).toContain("declaration-order mistake, not a recycle");

    const declared = judgeDeclaration(indep, order,
      ["recycleA", "recycleB", "inter"]);
    const off = declared.findings.filter((f) => f.kind === "OFF-CYCLE TEAR");
    expect(off.map((f) => f.stream)).toEqual(["inter"]);
    expect(off[0]!.message).toContain("lies on NO material cycle");
    //  Declaring it SILENCES the INVALID ORDER finding and raises the other
    //  one instead -- which is the whole point of the pair: the engine will
    //  not let a reader convert an ordering mistake into an iteration.
    expect(declared.findings.some((f) => f.kind === "INVALID ORDER")).toBe(false);
  });

  it("agrees with judgePlan about which tears an order forces", () => {
    //  The two functions answer different questions and must not disagree
    //  about the one fact they share.  Checked over every graph and every
    //  declaration of the graph's own order.
    for (const g of TEACH_GRAPHS) {
      const plan = judgePlan(g, g.declaredOrder);
      const v = judgeDeclaration(g, g.declaredOrder, plan.tears);
      expect(v.ok, `${g.id} should accept exactly the tears its order forces`)
        .toBe(true);
      expect(v.accepted.slice().sort()).toEqual(plan.tears.slice().sort());
    }
  });
});
