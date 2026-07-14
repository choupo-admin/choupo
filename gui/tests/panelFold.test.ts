/*---------------------------------------------------------------------------*\
  panelFold — the one-click slide-away geometry for the flowsheet's floating
  selection card (right) and the docked assistant-console row (bottom).
  Pure helpers, no DOM (mirrors exploreRail.test.ts).
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";

import {
  AGENT_BAR_PX,
  CARD_BODY_W,
  CARD_MARGIN,
  agentRowPx,
  cardFoldOffset,
  selectionLeafLabel,
} from "../src/ui/panelFold.js";

describe("selection card fold — offset", () => {
  it("expanded sits at its anchor (no translation)", () => {
    expect(cardFoldOffset(false)).toBe(0);
  });

  it("folded slides right by body + margin, parking the body off-screen with the handle flush at the edge", () => {
    expect(cardFoldOffset(true)).toBe(CARD_BODY_W + CARD_MARGIN);
  });
});

describe("selection card fold — handle label", () => {
  it("strips the unit:/stream: prefix", () => {
    expect(selectionLeafLabel("unit:flash1")).toBe("flash1");
    expect(selectionLeafLabel("stream:feed")).toBe("feed");
  });

  it("takes the leaf of a fractal dotted / slashed name", () => {
    expect(selectionLeafLabel("unit:plant.sector.flash1")).toBe("flash1");
    expect(selectionLeafLabel("stream:concentration/condensate1")).toBe("condensate1");
  });

  it("is empty for no selection", () => {
    expect(selectionLeafLabel(null)).toBe("");
  });
});

describe("docked console fold — row height", () => {
  it("folded is the slim header bar, expanded is the dragged height", () => {
    expect(agentRowPx(true, 360)).toBe(AGENT_BAR_PX);
    expect(agentRowPx(false, 360)).toBe(360);
    expect(agentRowPx(false, 500)).toBe(500);
  });
});
