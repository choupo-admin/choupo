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
  thermomlReader -- the TypeScript ThermoML reader held to the Python
  extractor it transcribes (DEV.md 4c C334).

  BOTH READERS RUN ON THE SAME BYTES.  gui/tests/thermomlParity.py imports
  bin/choupo-thermoml read-only and reports, per block, what its own
  functions return and what its COMMANDS write; this file reads the same
  files with gui/src/case/thermomlReader.ts and requires:

    * the same outcome per block and per geometry (record / refusal / error);
    * a record equal field by field, every float EXACTLY (both sides emit the
      shortest repr, so a double that differs in the last bit fails);
    * a refusal in the same words;
    * the same file-level choice (one block, or the listing that refuses);
    * the same `data ( ... )` rows and uncertainty values the commands write
      -- the numbers a fit reads, x to four decimals and T or P to six
      significant figures, rounded the way Python rounds.

  THE FILES ARE SYNTHETIC: gui/tests/thermomlShapes.synthetic.xml (twelve
  block shapes, invented numbers, placeholder identifiers) and the two
  fixtures under tutorials/props/curation/fixtures/thermoml/.  No measured
  series is committed.  Real archive files are checked when
  CHOUPO_THERMOML_PARITY_FILES names them (a path list, ':'-separated); the
  check is then SKIPPED, not passed, when the variable is absent, and the
  design record says what was run locally.

  WHAT THIS CANNOT PROVE: that either reader reads a file the way its
  authors meant.  It proves the two agree.
\*---------------------------------------------------------------------------*/

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  bubblePDataRows, bubbleTDataRows, interiorIndices, isReaderError, isRefusal,
  parseXml, pyFixed, pyFixedW, pyG, pyRepr, pyRound6, readThermoML, selectBlock,
  uncertaintyValues, XmlParseError,
  type BubblePRecord, type BubbleTRecord, type ThermoMLFile,
} from "../src/case/thermomlReader.js";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const HELPER = fileURLToPath(new URL("./thermomlParity.py", import.meta.url));
const SHAPES = fileURLToPath(new URL("./thermomlShapes.synthetic.xml", import.meta.url));
const FIXTURES = [
  `${REPO}tutorials/props/curation/fixtures/thermoml/binary-bubble-fixture.xml`,
  `${REPO}tutorials/props/curation/fixtures/thermoml/binary-bubble-fixture-heldout.xml`,
];

type Py = Record<string, unknown>;

function python(files: string[]): Py[] {
  const r = spawnSync("python3", ["-I", HELPER, ...files],
    { cwd: REPO, encoding: "utf-8", maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`thermomlParity.py failed:\n${r.stderr}`);
  return JSON.parse(r.stdout) as Py[];
}

/** The Python record, renamed to the TypeScript fields. */
function pyT(o: Py): Partial<BubbleTRecord> {
  const r: Partial<BubbleTRecord> = {
    kind: "bubbleT", system: o.system as [string, string],
    members: o.members as [string, string], doi: o.doi as string,
    points: o.points as [number, number][], uT: o.uT as (number | null)[],
    uTLevel: o.uT_level as string,
  };
  if ("P_kPa" in o) r.PkPa = o.P_kPa as number;
  if ("P_kPa_perPoint" in o) r.PkPaPerPoint = o.P_kPa_perPoint as number[];
  if ("isobars" in o) r.isobars = o.isobars as number[];
  return r;
}
function pyP(o: Py): Partial<BubblePRecord> {
  const r: Partial<BubblePRecord> = {
    kind: "bubbleP", system: o.system as [string, string],
    members: o.members as [string, string], doi: o.doi as string,
    points: o.points as [number, number, number][], uP: o.uP as number[],
    uPLevel: o.uP_level as string,
  };
  if ("T_K" in o) r.TK = o.T_K as number;
  if ("isotherms" in o) r.isotherms = o.isotherms as number[];
  return r;
}

/** Strict equality on floats: Object.is, so a last-bit difference fails. */
function sameDeep(a: unknown, b: unknown, path: string): void {
  if (typeof a === "number" && typeof b === "number") {
    expect(Object.is(a, b) || (a === b), `${path}: ${pyRepr(a)} vs ${pyRepr(b)}`).toBe(true);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    expect(a.length, `${path} length`).toBe(b.length);
    a.forEach((x, k) => sameDeep(x, b[k], `${path}[${k}]`));
    return;
  }
  expect(a, path).toEqual(b);
}

function compareFile(file: string, py: Py, ts: ThermoMLFile): number {
  const blocks = py.blocks as Py[];
  expect(ts.blocks.length, `${file}: block count`).toBe(blocks.length);
  let rows = 0;
  for (const pb of blocks) {
    const i = pb.index as number;
    const tb = ts.blocks[i]!;
    for (const [geo, toTs] of [["bubbleT", pyT], ["bubbleP", pyP]] as const) {
      const p = pb[geo] as Py;
      const t = tb[geo];
      const where = `${file} block ${i} ${geo}`;
      if ("ok" in p) {
        expect(isRefusal(t) || isReaderError(t), `${where}: Python read it, TS did not: ${JSON.stringify(t)}`).toBe(false);
        const want = toTs(p.ok as Py);
        for (const [k, v] of Object.entries(want)) sameDeep((t as unknown as Py)[k], v, `${where}.${k}`);
        for (const k of ["PkPa", "PkPaPerPoint", "isobars", "TK", "isotherms"])
          expect(k in (t as object), `${where}: TS has ${k} and Python does not`).toBe(k in want);
      } else if ("refused" in p) {
        expect(isRefusal(t), `${where}: Python refused, TS gave ${JSON.stringify(t).slice(0, 120)}`).toBe(true);
        expect((t as { refused: string }).refused, where).toBe(p.refused);
      } else {
        expect(isReaderError(t), `${where}: Python raised ${String(p.error)}`).toBe(true);
      }
    }
    //  The rows the commands WRITE.
    if (Array.isArray(pb.vleRows)) {
      const rec = tb.bubbleT as BubbleTRecord;
      const keep = interiorIndices(rec.points);
      expect(bubbleTDataRows(rec, keep), `${file} block ${i} extract-vle rows`).toEqual(pb.vleRows);
      expect(uncertaintyValues(rec.uT, keep), `${file} block ${i} extract-vle uncertainty`)
        .toBe(pb.vleU ?? null);
      rows += keep.length;
    }
    if (Array.isArray(pb.pxRows)) {
      const rec = tb.bubbleP as BubblePRecord;
      const keep = interiorIndices(rec.points);
      expect(bubblePDataRows(rec, keep), `${file} block ${i} extract-px rows`).toEqual(pb.pxRows);
      expect(uncertaintyValues(rec.uP, keep), `${file} block ${i} extract-px uncertainty`)
        .toBe(pb.pxU ?? null);
      rows += keep.length;
    }
  }
  //  The file-level choice (no --block).
  for (const [key, kind] of [["fileBubbleT", "bubbleT"], ["fileBubbleP", "bubbleP"]] as const) {
    const p = py[key] as Py;
    const t = kind === "bubbleT" ? selectBlock(ts, "bubbleT") : selectBlock(ts, "bubbleP");
    if ("ok" in p) {
      expect(isRefusal(t), `${file} ${key}: ${JSON.stringify(t).slice(0, 200)}`).toBe(false);
      sameDeep((t as unknown as Py).points, (p.ok as Py).points, `${file} ${key}.points`);
    } else if ("refused" in p) {
      expect(isRefusal(t), `${file} ${key}`).toBe(true);
      expect((t as { refused: string }).refused, `${file} ${key}`).toBe(p.refused);
    }
  }
  return rows;
}

describe("thermomlReader: held to bin/choupo-thermoml on synthetic files", () => {
  const files = [SHAPES, ...FIXTURES];
  const py = python(files);

  it("agrees with the extractor on every block, refusal, choice and written row", () => {
    let rows = 0;
    files.forEach((f, k) => {
      rows += compareFile(f, py[k]!, readThermoML(readFileSync(f, "utf-8")));
    });
    //  The comparison must have compared something: a helper that silently
    //  wrote no rows would leave this test green on nothing.
    expect(rows).toBeGreaterThanOrEqual(20);
  });

  it("the shapes file exercises every outcome it was written for", () => {
    const ts = readThermoML(readFileSync(SHAPES, "utf-8"));
    const okT = ts.blocks.filter((b) => !isRefusal(b.bubbleT) && !isReaderError(b.bubbleT)).length;
    const okP = ts.blocks.filter((b) => !isRefusal(b.bubbleP) && !isReaderError(b.bubbleP)).length;
    expect(ts.blocks.length).toBe(12);
    expect(okT).toBe(3);
    expect(okP).toBe(1);
    const words = ts.blocks.flatMap((b) => [b.bubbleT, b.bubbleP])
      .filter(isRefusal).map((r) => r.refused).join("\n");
    for (const w of ["Only BINARY", "REPORTS y BUT NO x", "THE TEMPERATURE VARIES",
      "NO STATED UNCERTAINTY", "repeat an earlier row", "'Pressure, MPa'", "declares 2 properties"])
      expect(words, w).toContain(w);
    expect(isRefusal(selectBlock(ts, "bubbleT"))).toBe(true);   // three to choose from
    expect(isRefusal(selectBlock(ts, "bubbleT", 0))).toBe(false);
  });

  it("reads multi-isotherm blocks only when asked, as --allow-multi-isotherm does", () => {
    const ts = readThermoML(readFileSync(SHAPES, "utf-8"), { multiIsotherm: true });
    const b3 = ts.blocks[3]!.bubbleP as BubblePRecord;
    expect(isRefusal(b3)).toBe(false);
    expect(b3.isotherms).toEqual([298.15, 323.15]);
  });
});

describe("thermomlReader: Python's number formatting, exactly", () => {
  const VALUES = [0, 1, -1, 0.5, 1.5, 2.5, 0.125, 0.12345, 0.99995, 0.00005, 0.0078125,
    101.325, 341.000049, 349.123456, 999999.5, 9999995, 1e-5, 1.5e-7, 123456789,
    0.1 + 0.2, 1 / 3, 2 / 3, 313.15, 1e16, 1.25e-4, 0.00012345, -2.5, -0.00004];
  const code = [
    "import json,sys",
    "v=json.loads(sys.argv[1])",
    "out=[]",
    "for x in map(float, v):",
    "  out.append([f'{x:8.4f}', f'{x:10.4f}', f'{x:.6f}', f'{x:.6g}', f'{x:g}', repr(float(x)), repr(round(x,6))])",
    "print(json.dumps(out))",
  ].join("\n");
  const r = spawnSync("python3", ["-I", "-c", code, JSON.stringify(VALUES)], { encoding: "utf-8" });
  const want = JSON.parse(r.stdout) as string[][];

  it("f-string fixed and general formats, repr and round(x, 6)", () => {
    VALUES.forEach((x, k) => {
      const w = want[k]!;
      expect(pyFixedW(x, 8, 4), `8.4f ${x}`).toBe(w[0]);
      expect(pyFixedW(x, 10, 4), `10.4f ${x}`).toBe(w[1]);
      expect(pyFixed(x, 6), `.6f ${x}`).toBe(w[2]);
      expect(pyG(x, 6), `.6g ${x}`).toBe(w[3]);
      expect(pyG(x), `g ${x}`).toBe(w[4]);
      expect(pyRepr(x), `repr ${x}`).toBe(w[5]);
      expect(pyRepr(pyRound6(x)), `round6 ${x}`).toBe(w[6]);
    });
  });
  it("keeps the sign of a negative zero, as Python does (JSON cannot carry -0.0)", () => {
    expect(pyFixed(-0, 4)).toBe("-0.0000");
    expect(pyRepr(-0)).toBe("-0.0");
  });
});

describe("thermomlReader: the XML reader refuses what ElementTree refuses", () => {
  it("mismatched tags, '--' in a comment, an undefined entity, two roots", () => {
    for (const bad of ["<a><b></a></b>", "<a><!-- x -- y --></a>", "<a>&nbsp;</a>", "<a/><b/>"])
      expect(() => parseXml(bad), bad).toThrow(XmlParseError);
  });
  it("joins the text around a comment and decodes entities and CDATA", () => {
    const r = parseXml("<?xml version='1.0'?><r>a<!-- c -->b&amp;<![CDATA[<c>]]>&#65;<k/>tail</r>");
    expect(r.text).toBe("ab&<c>A");
    expect(r.children[0]!.tag).toBe("k");
  });
  it("strips a namespace prefix from the tag", () => {
    expect(parseXml("<t:DataReport xmlns:t='u'/>").tag).toBe("DataReport");
  });
});

//  REAL ARCHIVE FILES, when a person names them.  Never committed, never
//  assumed: absent the variable this is SKIPPED, and a skip is not a pass.
const REAL = (process.env.CHOUPO_THERMOML_PARITY_FILES ?? "").split(":").filter(Boolean);
describe("thermomlReader: held to the extractor on REAL archive files (opt-in)", () => {
  it.skipIf(REAL.length === 0)("agrees on every named file", () => {
    const BATCH = 200;
    let rows = 0;
    for (let s = 0; s < REAL.length; s += BATCH) {
      const files = REAL.slice(s, s + BATCH);
      const py = python(files);
      files.forEach((f, k) => {
        rows += compareFile(f, py[k]!, readThermoML(readFileSync(f, "utf-8")));
      });
    }
    // eslint-disable-next-line no-console
    console.log(`thermomlReader: ${REAL.length} real file(s), ${rows} written row(s) agreed`);
  }, 3_600_000);
});
