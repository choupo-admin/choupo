import { describe, it, expect } from "vitest";
import { ENTHALPY_STEPS } from "../src/ui/methods/reactionEnthalpyLesson";
import { STANDARD_STATE_STEPS } from "../src/ui/methods/standardStateLesson";
import { METHOD_TOOLS } from "../src/ui/methods/registry";
import { renderTex } from "../src/ui/methods/lessonTex";

//  DEV.md 4c C43: Reaction Enthalpy's Kirchhoff step points to where the
//  chain continues, Standard State's "Where the 1/T² comes from".  A pointer
//  must land: on a LIVE tool, at a step that tool really has.
const STEPS_OF: Record<string, readonly { title: string }[]> = {
  "standard-state": STANDARD_STATE_STEPS,
};

describe("a lesson's 'where does this lead?' pointer lands", () => {
  const pointers = ENTHALPY_STEPS.filter((s) => s.leadsTo);

  it("the Kirchhoff step carries one", () => {
    expect(pointers.map((s) => s.title)).toEqual([
      expect.stringContaining("Kirchhoff"),
    ]);
  });

  it("on a live registered tool, at a step it has, with a chain that parses", () => {
    for (const s of pointers) {
      const lt = s.leadsTo!;
      const tool = METHOD_TOOLS.find((t) => t.id === lt.tool);
      expect(tool?.status).toBe("live");
      expect(tool?.label.toLowerCase()).toContain(lt.toolLabel.toLowerCase());
      expect((STEPS_OF[lt.tool] ?? []).some((st) => st.title.startsWith(lt.stepTitle)))
        .toBe(true);
      if (lt.chain) expect(renderTex(lt.chain, "display").ok).toBe(true);
    }
  });
});
