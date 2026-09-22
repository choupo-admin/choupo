/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * How big the symbol is, and how short a node may get.
 *
 * The claim these hold is the one the whole slice rests on: the SIMPLE node
 * shows a BIGGER symbol in a SMALLER box.  If that ever stops being true the
 * chip is pointless -- it would be growing the sheet to grow the drawing,
 * which is what the first two attempts did.
 */
import { describe, it, expect } from "vitest";
import {
  symbolSizeFor, nodeMinHeight,
  SYMBOL_PX_FULL, SYMBOL_PX_SIMPLE, MIN_BOX_PX, PORT_PITCH_PX,
} from "../src/case/nodeDetail";

describe("the claim the detail chip rests on", () => {
  it("the SIMPLE node's symbol is bigger than the full one's", () => {
    expect(symbolSizeFor(false)).toBeGreaterThan(symbolSizeFor(true));
    expect(symbolSizeFor(true)).toBe(SYMBOL_PX_FULL);
    expect(symbolSizeFor(false)).toBe(SYMBOL_PX_SIMPLE);
  });

  it("and it fits in a box SHORTER than a full node", () => {
    //  A full node carries symbol + name + badge row + up to three parameter
    //  lines.  If the simple floor ever grew past that there would be no
    //  point to the chip: the sheet would be growing to make the drawing
    //  grow, which is the trap this replaced.  130 is toGraph.ts's Y_STEP --
    //  the lane a sibling gets -- so the floor must stay well inside it.
    expect(MIN_BOX_PX).toBeLessThan(130);
    expect(MIN_BOX_PX).toBeGreaterThan(SYMBOL_PX_SIMPLE);
  });
});

describe("a short box must not crowd its own handles", () => {
  it("a FULL node imposes no floor -- its content is taller anyway", () => {
    expect(nodeMinHeight(true, 1, 1)).toBeUndefined();
    expect(nodeMinHeight(true, 9, 9)).toBeUndefined();
  });

  it("a simple node with few ports keeps the flat minimum", () => {
    expect(nodeMinHeight(false, 1, 1)).toBe(MIN_BOX_PX);
    expect(nodeMinHeight(false, 2, 1)).toBe(MIN_BOX_PX);
  });

  it("a busy unit grows to fit its ports", () => {
    //  The evaporator named in UnitNode's own comment: 2 in, 3 out.
    expect(nodeMinHeight(false, 2, 3)).toBe(3 * PORT_PITCH_PX);
    expect(nodeMinHeight(false, 6, 2)).toBe(6 * PORT_PITCH_PX);
  });

  it("sizes on the BUSIER SIDE, never the sum", () => {
    //  Ports are on opposite borders: four in and four out crowd exactly as
    //  much as four in alone.  Summing would make every unit needlessly
    //  tall, which is the opposite of the point.
    expect(nodeMinHeight(false, 4, 4)).toBe(nodeMinHeight(false, 4, 0));
    expect(nodeMinHeight(false, 4, 4)).toBeLessThan(8 * PORT_PITCH_PX);
  });

  it("a unit with no ports still gets a box", () => {
    expect(nodeMinHeight(false, 0, 0)).toBe(MIN_BOX_PX);
  });
});
