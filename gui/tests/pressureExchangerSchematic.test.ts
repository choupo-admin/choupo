/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  The rotary pressure exchanger's schematic is drawn from its sheet alone
  (DEV.md 4c C192).

  THE FIXTURE BELOW IS A TRANSCRIPTION of the sheet the engine writes for
  `tutorials/steady/membranes/membrane27_swro_energy_recovery` --
  design/PX/pressureExchanger -- because `design/` is a run output and
  gitignored, so no committed file can be read here.  A transcription drifts
  from its original in silence, so `check_pressure_exchanger` arm (d) RUNS the
  witness and holds every header word, sizing triple and port line of this
  fixture to what it wrote (the check_design_sheet (l) rule).
\*---------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";
import { parseDesignSheet } from "../src/case/designSheet.js";
import {
  PROVENANCE_INK, PROVENANCE_WORD, hasSchematic, pressureExchangerSvg,
} from "../src/case/equipmentSchematic.js";

const PX_SHEET = `recordType  designSheet;

unit        "PX";
equipment   pressureExchanger;
material    SS316;
basis       "rotors = ceil(Q_LP / ratedFlowPerUnit) in parallel, each seeing 1/rotors of every flow at the same pressures; the rated flow per unit is a DECLARED maker's datum (Order of magnitude of the ERI PX-Q300 class as stated in DEV.md 4c C192 (~50-68 m3/h per unit); the maker's data sheet was not read -- an AUTHOR-SET figure, to be replaced by the sheet's rated flow); the HP and LP pressure drops, the recovered pressure and the HYDRAULIC booster duty (eta_pump = 1) are read from the unit; pressureDesign declared; NOT costed -- no Turton set covers a rotary pressure exchanger";

inlets
{
    port0
    {
        global      "brine";
        bc          tear;
        T           298.15 K;
        P           5412314.1 Pa;
        F           0.1303543 kmol/s;
        mdot        2.455592 kg/s;
        vapourFraction 0;
    }
    port1
    {
        global      "toPX";
        bc          interior;
        T           298.15 K;
        P           200000 Pa;
        F           0.13033305 kmol/s;
        mdot        2.4027446 kg/s;
        vapourFraction 0;
    }
}

outlets
{
    port0
    {
        global      "pxHPout";
        bc          interior;
        T           298.15 K;
        P           5336539.4 Pa;
        F           0.12714616 kmol/s;
        mdot        2.345543 kg/s;
        vapourFraction 0;
    }
    port1
    {
        global      "spentBrine";
        bc          computed;
        T           298.15 K;
        P           130000 Pa;
        F           0.13354119 kmol/s;
        mdot        2.5127937 kg/s;
        vapourFraction 0;
    }
}

sizing
{
    P_HPin                54.123141 bar;
    P_HPout               53.365394 bar;
    P_recovered           51.365394 bar;
    Q_HP                  8.3072058 m3/h;
    Q_HPout               8.1825977 m3/h;
    Q_LP                  8.3902498 m3/h;
    Q_LPout               8.5148578 m3/h;
    boosterPower          0.37153669 kW;
    dP_HP                 0.75774683 bar;
    dP_LP                 0.7 bar;
    efficiency            [0 0 0 0 0] 0.96;
    flowPerRotor          8.3902498 m3/h;
    leakage               [0 0 0 0 0] 0.015;
    mixing                [0 0 0 0 0] 0.03;
    pressureDesign        70 bar;
    ratedFlowPerUnit      60 m3/h;
    rotors                [0 0 0 0 0] 1;
    salinityIncrease      [0 0 0 0 0] 0.028317602;
}
`;

const sheet = () => {
  const s = parseDesignSheet(PX_SHEET);
  if (!s) throw new Error("the fixture did not parse");
  return s;
};

describe("the pressure exchanger is dispatched on its equipment word", () => {
  it("has a drawing, like the tower and unlike a drum", () => {
    expect(hasSchematic("pressureExchanger")).toBe(true);
    expect(hasSchematic("vessel")).toBe(false);
  });
});

describe("the drawing letters what the sheet states and nothing else", () => {
  it("names the four ports with the pressures the run wrote, in bar", () => {
    const d = pressureExchangerSvg(sheet());
    expect(d.svg).toContain("brine  54.12 bar");
    expect(d.svg).toContain("toPX  2.00 bar");
    expect(d.svg).toContain("pxHPout  53.37 bar");
    expect(d.svg).toContain("spentBrine  1.30 bar");
    for (const w of ["HP in", "HP out", "LP in", "LP out"]) expect(d.svg).toContain(w);
  });

  it("puts the rotor count and the recovered pressure in Choupo's ink and word, "
     + "the rated flow in the author's", () => {
    const d = pressureExchangerSvg(sheet());
    expect(d.rotors).toBe(1);
    expect(d.svg).toContain(`1 rotor in parallel (${PROVENANCE_WORD.choupo})`);
    expect(d.svg).toContain(`rated 60 m3/h per unit (${PROVENANCE_WORD.declared})`);
    expect(d.svg).toContain(`recovers 51.37 bar (${PROVENANCE_WORD.choupo})`);
    expect(d.svg).toContain(`fill="${PROVENANCE_INK.declared}"`);
    expect(d.svg).toContain(`fill="${PROVENANCE_INK.choupo}"`);
  });

  it("draws the booster beside the high-pressure outlet with the HYDRAULIC duty", () => {
    const d = pressureExchangerSvg(sheet());
    expect(d.svg).toContain(">booster<");
    expect(d.svg).toContain(`0.3715 kW (${PROVENANCE_WORD.choupo})`);
    expect(d.svg).toContain(`HP side loses 0.7577 bar (${PROVENANCE_WORD.choupo})`);
  });

  it("says the rotor is nominal and the design pressure's provenance is not published", () => {
    const d = pressureExchangerSvg(sheet());
    expect(d.svg).toContain("rotor geometry not published: nominal");
    expect(d.svg).toContain("design pressure 70 bar (provenance not published)");
    //  No rotor diameter or length is anywhere on the picture: the sheet
    //  carries none, so none may be drawn.
    expect(d.svg).not.toMatch(/⌀/);
  });

  it("keeps the prose BESIDE the picture: the device numbers are notes", () => {
    const d = pressureExchangerSvg(sheet());
    const texts = d.notes.map((n) => n.text);
    expect(texts).toContain("pressure-transfer efficiency 0.96");
    expect(texts).toContain("volumetric mixing 0.03");
    expect(texts).toContain("leakage (lubrication flow) 0.015");
    expect(texts.some((t) => t.includes("2.83 %"))).toBe(true);
    expect(d.notes.filter((n) => n.who === "declared").length).toBe(3);
    expect(d.notes.some((n) => n.who === null && /NOT costed/.test(n.text))).toBe(true);
  });

  it("leaves a dimension the sheet does not carry OFF the drawing, never zero", () => {
    const bare = parseDesignSheet(PX_SHEET.replace(/    boosterPower .*\n/, "")
      .replace(/    rotors .*\n/, ""));
    if (!bare) throw new Error("the stripped fixture did not parse");
    const d = pressureExchangerSvg(bare);
    expect(d.rotors).toBe(0);
    expect(d.svg).toContain("duty not published");
    expect(d.svg).not.toContain("rotor in parallel");
  });
});
