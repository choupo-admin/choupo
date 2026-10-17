/*---------------------------------------------------------------------------*\
  The plant layout EduTool (DEV.md 4c C75, slice 2), held to the tree.

  What it holds, block by block:
    * the shelf, the kind, the theory anchor and the workspace dispatch;
    * the bench's knobs: the shipped values against the witness's own
      layoutDict, and every override applied to the REAL witness and read
      back ENTRY BY ENTRY -- a knob that moved the wrong item would still run,
      so only reading the file back can see it;
    * the guided moves: each preset's sentence against the witness's own
      geometry (the published sizes from its golden, the declared positions,
      wind, zones and distances from its file), recomputed here by the
      engine's own rules -- the page shows the engine's live answer beside
      the sentence, and this keeps the sentence from drifting away from it;
    * the numbers the lesson quotes, against the same;
    * the lesson text: nothing quoted, every equation parses, every standard
      it names is marked NOT READ, and every file:line it cites lands on the
      statement it claims.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  DRUM, LAYOUT_DICT, LAYOUT_WITNESS, PRESETS, ROOM, SHIPPED, entryOccurrence,
  layoutLines, layoutOverrides, witnessLayoutText, type LayoutKnobs,
} from "../src/ui/methods/layoutExercise.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import {
  LAYOUT_SOURCES, PLANT_LAYOUT_LIMITS, PLANT_LAYOUT_STEPS,
} from "../src/ui/methods/plantLayoutLesson.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const CASE = `tutorials/${LAYOUT_WITNESS}`;

// ---- the witness, read ---------------------------------------------------------

/** The text of one `item`/`nonProcess` entry of a layoutDict: from its own
 *  head line to the next entry's head (or the end of the items list). */
function entry(text: string, id: string): string {
  const head = new RegExp(`^[ \\t]*(?:item|nonProcess)[ \\t]+"${id}"[ \\t]*;`, "m").exec(text);
  if (!head) throw new Error(`no entry ${id}`);
  const rest = text.slice(head.index + head[0].length);
  const next = /^[ \t]*(?:item|nonProcess)[ \t]+"|^\);/m.exec(rest);
  return text.slice(head.index, head.index + head[0].length + (next ? next.index : rest.length));
}
function num(body: string, key: string): number {
  const m = new RegExp(`^[ \\t]*${key}[ \\t]+([-+0-9.eE]+)`, "m").exec(body);
  if (!m) throw new Error(`no ${key}`);
  return Number(m[1]);
}
function word(body: string, key: string): string {
  const m = new RegExp(`^[ \\t]*${key}[ \\t]+([A-Za-z]+)[ \\t]*;`, "m").exec(body);
  if (!m) throw new Error(`no ${key}`);
  return m[1]!;
}
/** A `layout <id> <field> <value>` golden row of the witness. */
function golden(id: string, field: string): number {
  const m = new RegExp(`^layout\\s+${id.replace(/[:.]/g, "\\$&")}\\s+${field}\\s+([-+0-9.eE]+)`, "m")
    .exec(tree(`${CASE}/expected`));
  if (!m) throw new Error(`no golden layout ${id}.${field}`);
  return Number(m[1]);
}

// ---- the engine's rules, recomputed (PlantLayout.cpp; cited in the lesson) -----

interface Item { id: string; x: number; y: number; z: number; dx: number; dy: number;
  dz: number; circle: boolean }
const ITEMS = ["makeupComp", "recycleComp", "converter", "FEHE", "waterCooler",
  "separator", "letdown", "controlRoom"] as const;
function itemsFor(k: LayoutKnobs): Map<string, Item> {
  const m = new Map<string, Item>();
  for (const id of ITEMS) {
    const circle = ["converter", "separator", "letdown"].includes(id);
    m.set(id, { id, x: golden(id, "x"), y: golden(id, "y"), z: golden(id, "z"),
      dx: golden(id, "dx"), dy: golden(id, "dy"), dz: golden(id, "dz"), circle });
  }
  Object.assign(m.get(DRUM)!, { x: k.drumX, y: k.drumY });
  Object.assign(m.get(ROOM)!, { x: k.roomX, y: k.roomY });
  return m;
}
/** clearPlan (PlantLayout.cpp:133), for the shapes the witness carries. */
function clear(a: Item, b: Item): number {
  if (a.circle && b.circle) return Math.hypot(a.x - b.x, a.y - b.y) - a.dx / 2 - b.dx / 2;
  if (!a.circle && !b.circle) {
    const gx = Math.abs(a.x - b.x) - (a.dx + b.dx) / 2;
    const gy = Math.abs(a.y - b.y) - (a.dy + b.dy) / 2;
    if (gx > 0 && gy > 0) return Math.hypot(gx, gy);
    return gx > 0 ? gx : gy > 0 ? gy : Math.max(gx, gy);
  }
  const c = a.circle ? a : b, r = a.circle ? b : a;
  const px = Math.min(Math.max(c.x, r.x - r.dx / 2), r.x + r.dx / 2);
  const py = Math.min(Math.max(c.y, r.y - r.dy / 2), r.y + r.dy / 2);
  return Math.hypot(c.x - px, c.y - py) - c.dx / 2;
}
const KIND: Record<string, string> = { makeupComp: "compressor", recycleComp: "compressor",
  converter: "vessel", separator: "vessel", letdown: "vessel", FEHE: "shellTubeHX",
  waterCooler: "shellTubeHX", controlRoom: "building" };
/** The witness's separation table, read from its file. */
function rules(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of text.matchAll(/between\s*\(\s*(\w+)\s+(\w+)\s*\)\s*;\s*distance\s+([0-9.]+)\s*m/g))
    out.set([m[1], m[2]].sort().join("|"), Number(m[3]));
  return out;
}
/** Every finding the engine's rules give for these knobs: [kind, a, b]. */
function findings(k: LayoutKnobs): string[] {
  const text = witnessLayoutText();
  const it = itemsFor(k);
  const out: string[] = [];
  const all = [...it.values()];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]!, b = all[j]!;
      const c = clear(a, b);
      const vz = Math.min(a.z + a.dz, b.z + b.dz) - Math.max(a.z, b.z);
      if (c < -1e-6 && vz > 1e-6) out.push(`OVERLAP ${a.id} ${b.id}`);
      const req = rules(text).get([KIND[a.id], KIND[b.id]].sort().join("|"));
      if (req === undefined) continue;
      const d = k.measure === "edgeToEdge" ? c : Math.hypot(a.x - b.x, a.y - b.y);
      if (d < req - 1e-6) out.push(`separation ${a.id} ${b.id}`);
    }
  const room = it.get(ROOM)!;
  const halfAngle = num(text.slice(text.indexOf("wind")), "halfAngle");
  const reach = num(text.slice(text.indexOf("wind")), "reach");
  const downwind = (k.windFrom + 180) % 360;
  for (const rel of ["makeupComp", "recycleComp", "separator", "letdown"]) {
    const r = it.get(rel)!;
    const vx = room.x - r.x, vy = room.y - r.y, d = Math.hypot(vx, vy);
    let b = (Math.atan2(vx, vy) * 180) / Math.PI; if (b < 0) b += 360;
    let off = b - downwind; while (off > 180) off -= 360; while (off < -180) off += 360;
    if (d <= reach && Math.abs(off) <= halfAngle) out.push(`downwind ${rel}`);
    //  The zone envelopes (pointToFootprint, PlantLayout.cpp:161, for a box).
    const body = entry(text, rel);
    for (const z of body.matchAll(/zone\s+(\d);\s*radius\s+([0-9.]+)\s*m;\s*height\s+([0-9.]+)\s*m/g)) {
      const gx = Math.max(0, Math.abs(r.x - room.x) - room.dx / 2);
      const gy = Math.max(0, Math.abs(r.y - room.y) - room.dy / 2);
      const dPlan = Math.hypot(gx, gy);
      const vzz = Math.min(r.z + Number(z[3]), room.z + room.dz) - Math.max(r.z, room.z);
      if (dPlan < Number(z[2]) - 1e-6 && vzz > 1e-6) out.push(`zone${z[1]} ${rel}`);
    }
  }
  return out;
}

// ---- the registry -----------------------------------------------------------------

describe("plant layout: the shelf, the kind and the dispatch", () => {
  const t = METHOD_TOOLS.find((m) => m.id === "plant-layout");
  it("is a live construction on the Process design & economics shelf", () => {
    expect(t?.status).toBe("live");
    expect(t?.kind).toBe("construction");
    expect(t?.discipline).toBe("Process design & economics");
    expect(t?.theory).toBe("ch:size-vessel");
  });
  it("the workspace renders it", () => {
    expect(tree("gui/src/ui/MethodsWorkspace.tsx"))
      .toContain('tool === "plant-layout" ? <PlantLayoutTool />');
  });
  it("names a witness the bundled corpus carries, with a layoutDict", () => {
    expect(tutorialByName(LAYOUT_WITNESS)?.files.rawFiles?.[LAYOUT_DICT]).toBeDefined();
  });
});

// ---- the bench's knobs --------------------------------------------------------------

describe("plant layout: the knobs and the overrides", () => {
  const text = tree(`${CASE}/${LAYOUT_DICT}`);
  it("the shipped knobs are the witness's own declarations", () => {
    expect(witnessLayoutText()).toBe(text);
    expect(num(entry(text, DRUM), "x")).toBe(SHIPPED.drumX);
    expect(num(entry(text, DRUM), "y")).toBe(SHIPPED.drumY);
    expect(num(entry(text, ROOM), "x")).toBe(SHIPPED.roomX);
    expect(num(entry(text, ROOM), "y")).toBe(SHIPPED.roomY);
    expect(num(text, "from")).toBe(SHIPPED.windFrom);
    expect(word(text, "measure")).toBe(SHIPPED.measure);
  });
  it("every override lands in its own entry, and moves nothing else", () => {
    const k: LayoutKnobs = { drumX: 61.25, drumY: -7.5, roomX: 81, roomY: 22,
      windFrom: 45, measure: "centreToCentre" };
    const out = methodCase(LAYOUT_WITNESS, layoutOverrides(k)).rawFiles![LAYOUT_DICT]!;
    expect(num(entry(out, DRUM), "x")).toBe(61.25);
    expect(num(entry(out, DRUM), "y")).toBe(-7.5);
    expect(num(entry(out, ROOM), "x")).toBe(81);
    expect(num(entry(out, ROOM), "y")).toBe(22);
    expect(num(out, "from")).toBe(45);
    expect(word(out, "measure")).toBe("centreToCentre");
    for (const id of ITEMS.filter((i) => i !== DRUM && i !== ROOM))
      expect(entry(out, id), id).toBe(entry(text, id));
    //  The units stay the file's.
    expect(entry(out, DRUM)).toMatch(/^\s*x\s+61\.25 m;/m);
    expect(out).toMatch(/^\s*from\s+45 deg;/m);
  });
  it("the occurrence is found from the entry, and an absent entry refuses", () => {
    expect(entryOccurrence(text, DRUM, "x")).toBe(7);
    expect(entryOccurrence(text, "makeupComp", "x")).toBe(1);
    expect(() => entryOccurrence(text, "noSuchItem", "x")).toThrow(/noSuchItem/);
  });
  it("keeps the engine's layout lines and drops the summary count", () => {
    const log = "header\n[layout] `a` (vessel) and `b` (vessel) stand 1 m apart\n"
      + "[layout] system/layoutDict: 8 item(s) placed\n"
      + "ERROR: layoutDict: `a` and `b` OVERLAP: x\n";
    expect(layoutLines(log)).toEqual([
      "[layout] `a` (vessel) and `b` (vessel) stand 1 m apart",
      "ERROR: layoutDict: `a` and `b` OVERLAP: x"]);
    expect(layoutLines(null)).toEqual([]);
  });
});

// ---- the guided moves -------------------------------------------------------------

describe("plant layout: each guided move says what the engine's rules give", () => {
  const byId = (id: string) => PRESETS.find((p) => p.id === id)!;
  it("the shipped plan's one finding is the golden one", () => {
    expect(findings(byId("shipped").knobs)).toEqual(["separation separator letdown"]);
    const it0 = itemsFor(SHIPPED);
    expect(clear(it0.get("separator")!, it0.get(DRUM)!))
      .toBeCloseTo(golden("separation:separator:letdown", "value"), 6);
  });
  it("move 2 clears it (about 4.4 m)", () => {
    expect(findings(byId("drum-moved").knobs)).toEqual([]);
    const it2 = itemsFor(byId("drum-moved").knobs);
    expect(clear(it2.get("separator")!, it2.get(DRUM)!)).toBeCloseTo(4.386, 3);
  });
  it("move 3 is an overlap, which the engine refuses", () => {
    expect(findings(byId("drum-overlap").knobs)).toContain("OVERLAP separator letdown");
  });
  it("move 4: 3.5 m centre to centre, still short", () => {
    expect(findings(byId("centre").knobs)).toEqual(["separation separator letdown"]);
  });
  it("move 5: the control room, unmoved, downwind of both compressors", () => {
    expect(findings(byId("wind-ne").knobs).filter((f) => f.startsWith("downwind")))
      .toEqual(["downwind makeupComp", "downwind recycleComp"]);
    expect(findings(SHIPPED).filter((f) => f.startsWith("downwind"))).toEqual([]);
  });
  it("move 6: downwind of the separator and the drum, short of 30 m to four process items", () => {
    const f = findings(byId("room-downwind").knobs);
    expect(f.filter((x) => x.startsWith("downwind")))
      .toEqual(["downwind separator", "downwind letdown"]);
    expect(f.filter((x) => x.startsWith("separation") && x.includes(ROOM))).toHaveLength(4);
  });
  it("move 7: inside the make-up compressor's zone 2, short of 30 m to four process items", () => {
    const f = findings(byId("room-zone").knobs);
    expect(f.filter((x) => x.startsWith("zone"))).toEqual(["zone2 makeupComp"]);
    expect(f.filter((x) => x.startsWith("separation") && x.includes(ROOM))).toHaveLength(4);
  });
});

// ---- the lesson text ------------------------------------------------------------------

const all = prose(PLANT_LAYOUT_STEPS.map((s) => `${s.title} ${s.body} ${s.note ?? ""}`).join(" "));

describe("plant layout: the numbers the lesson quotes", () => {
  const it0 = itemsFor(SHIPPED);
  const Dsep = golden("separator", "dx"), Ddrum = golden(DRUM, "dx");
  it("1.886 m against 4 m", () => {
    expect(all).toContain("1.886 m from the separator");
    expect(golden("separation:separator:letdown", "value").toFixed(3)).toBe("1.886");
    expect(golden("separation:separator:letdown", "limit")).toBe(4);
  });
  it("the drum must stand at about 61.61 m or more", () => {
    expect(all).toContain("about 61.61 m");
    expect((it0.get("separator")!.x + Dsep / 2 + Ddrum / 2 + 4).toFixed(2)).toBe("61.61");
  });
  it("3.5 m centre to centre; 2.4 m clear; 5.6 m between centres; 2.6 m and 0.6 m across", () => {
    expect(all).toContain("3.5 m apart");
    expect(Math.hypot(SHIPPED.drumX - 56, 0)).toBe(3.5);
    expect((4 - Dsep / 2 - Ddrum / 2).toFixed(1)).toBe("2.4");
    expect((4 + Dsep / 2 + Ddrum / 2).toFixed(1)).toBe("5.6");
    expect(Dsep.toFixed(1)).toBe("2.6");
    expect(Ddrum.toFixed(1)).toBe("0.6");
  });
});

describe("plant layout: the lesson text", () => {
  it("quotes nothing", () => {
    expect(all).not.toMatch(/["“”]/);
    for (const l of PLANT_LAYOUT_LIMITS) expect(l.body).not.toMatch(/["“”]/);
    for (const s of LAYOUT_SOURCES) expect(`${s.cite} ${s.used}`).not.toMatch(/["“”]/);
  });
  it("every equation parses", () => {
    for (const s of PLANT_LAYOUT_STEPS) {
      if (s.formula) expect(texParses(s.formula), `step ${s.n}`).toBe(true);
      for (const g of s.where ?? []) expect(texParses(g.sym), `step ${s.n} ${g.sym}`).toBe(true);
    }
  });
  it("marks every standard it names as NOT READ, and the directive as read", () => {
    for (const id of ["ccps", "gap", "mecklenburgh", "iec-60079-10-1", "ei-15", "api-rp-505"])
      expect(LAYOUT_SOURCES.find((s) => s.id === id)!.used).toContain("NOT READ");
    expect(LAYOUT_SOURCES.find((s) => s.id === "atex-1999-92")!.used).toMatch(/^read/);
  });
  it("names the pipe LENGTH and claims no pipe cost (C80)", () => {
    //  The absence that was buried: lengths exist now, and the page says so.
    expect(all).not.toMatch(/Choupo computes no pipe length/);
    expect(all).toMatch(/publishes each pipe's length/);
    //  ... and the cost does not, and the page says THAT.
    expect(all).toMatch(/a pipe's pressure drop and its cost/);
    expect(all).not.toMatch(/pipe cost (is|of) [0-9]/i);
    const record = tree("docs/design/a-plant-layout-is-declared-and-checked.md");
    expect(record).toMatch(/## 11\. Slice 3 -- the pipes/);
    expect(record).toMatch(/NO pressure drop\s+and NO cost/);
  });
  it("every file:line it cites lands on what it claims", () => {
    const src = tree("src/postProcessing/layout/PlantLayout.cpp").split("\n");
    const line = (n: number): string => src[n - 1] ?? "";
    const span = (a: number, b: number): string => src.slice(a - 1, b).join("\n");
    const cited = new Set([...all.matchAll(/PlantLayout\.cpp:(\d+)(?:-(\d+))?/g)].map((m) => m[0]));
    const CLAIMS: Record<string, string | RegExp> = {
      "PlantLayout.cpp:381": "it.dx = D; it.dy = D; it.dz = L",
      "PlantLayout.cpp:198-201": /"D",\s+"H"[\s\S]*"shellID"[\s\S]*"chamberDiameter"/,
      "PlantLayout.cpp:209": '"sieveTrays"',
      "PlantLayout.cpp:1165": "already published its size",
      "PlantLayout.cpp:1177": "No size is",
      "PlantLayout.cpp:137": "std::hypot(a.x - b.x, a.y - b.y) - 0.5 * a.dx - 0.5 * b.dx",
      "PlantLayout.cpp:1297-1299": /tab\.measure == "edgeToEdge"[\s\S]*clearPlan\(a, b\)[\s\S]*std::hypot/,
      "PlantLayout.cpp:265": "`measure` is not declared",
      "PlantLayout.cpp:1158": "it.kind   = s->second.equipmentType",
      "PlantLayout.cpp:308": "is declared twice",
      "PlantLayout.cpp:1301": 'addFinding("separation"',
      "PlantLayout.cpp:1679-1680": /const scalar gap = std::max\(\{ prev\.dx, prev\.dy, it\.dx, it\.dy \}\);\s*x = prev\.x \+ 0\.5 \* prev\.dx \+ gap \+ 0\.5 \* it\.dx;/,
      "PlantLayout.cpp:1695": "std::ceil(x * 100.0",
      "PlantLayout.cpp:81-82": /std::cerr << "\[layout\] "[\s\S]*AdvisoryLog::instance\(\)\.add\("layout"/,
      "PlantLayout.cpp:1218-1219": /c < -kTol && vz > kTol[\s\S]*OVERLAP/,
      "PlantLayout.cpp:1385": "w.fromDeg + 180.0",
      "PlantLayout.cpp:1395-1398": /planBearing\(vx, vy\)[\s\S]*w\.planNorthDeg[\s\S]*wrap180\(trueB - downwind\)[\s\S]*w\.halfAngleDeg/,
      "PlantLayout.cpp:1394": "dist > w.reach",
      "PlantLayout.cpp:106": "carries no unit",
      "PlantLayout.cpp:221": 'lookupWord("ignition")',
      "PlantLayout.cpp:1361-1364": /dPlan >= z\.radius[\s\S]*verticalOverlap\(rel\.z, z\.height, ig\.z, ig\.dz\)[\s\S]*ignitionInZone/,
      "PlantLayout.cpp:161": "scalar pointToFootprint",
      //  The pipes (C80): the rack route, the length, the default rack.
      "PlantLayout.cpp:803-819":
        /p\.routedBy = "rack";[\s\S]*pts\.push_back\(\{ a\.point\[0\], a\.point\[1\], lz \}\);[\s\S]*pts\.push_back\(\{ b\.point\[0\], ly, lz \}\);[\s\S]*pts\.push_back\(b\.point\);/,
      "PlantLayout.cpp:824": "p.length += segLength(p.route[i - 1], p.route[i]);",
      "PlantLayout.cpp:828": "if (!rack.declared)",
      //  The plot (C82): the envelope grown by the margin, its area, the
      //  footprints' own area, the undeclared margin announced.
      "PlantLayout.cpp:923-925":
        /pl\.xMin = x0 - pl\.margin;[\s\S]*pl\.plotArea = \(pl\.xMax - pl\.xMin\) \* \(pl\.yMax - pl\.yMin\);/,
      "PlantLayout.cpp:928": "pl.footprintArea += planArea(i);",
      "PlantLayout.cpp:992": "if (!pl.marginDeclared)",
    };
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const [c, want] of Object.entries(CLAIMS)) {
      expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
      const [a, b] = c.split(":")[1]!.split("-").map(Number);
      const text = b === undefined ? line(a!) : span(a!, b);
      if (typeof want === "string") expect(text, c).toContain(want);
      else expect(text, c).toMatch(want);
    }
    expect(tree("src/core/AdvisorySummary.H").split("\n")[116])
      .toContain('category == "layout" ? "PLANT LAYOUT"');
    expect(all).toContain("src/core/AdvisorySummary.H:117");
  });
});
