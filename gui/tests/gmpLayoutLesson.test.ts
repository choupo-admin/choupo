/*---------------------------------------------------------------------------*\
  The GMP interior EduTool (DEV.md 4c C101), held to the tree.

  What it holds, block by block:
    * the shelf, the kind, the dispatch, and the links both ways with the
      plant-layout page;
    * the teaching building: the page's copy is the committed file, the host
      tutorial declares no layoutDict of its own (the copy adds one, it never
      replaces one), every room an edit names is in it, every edit lands
      exactly once, and an absent or ambiguous edit refuses;
    * THE ENGINE, NATIVELY: the building as designed, and every guided move
      of every part, built with the page's own functions into the exact file
      map the browser worker receives, run by this checkout's choupoSolve --
      and the finding ids it publishes EQUAL the move's declared list (or it
      refuses with the declared message).  The sentence beside the engine's
      live answer on the page therefore cannot drift from it;
    * the numbers the lesson quotes, against that run;
    * the lesson text: nothing quoted, every equation parses, every source
      not read is marked NOT READ, and every file:line it cites lands on the
      statement it claims.
\*---------------------------------------------------------------------------*/

import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { serialiseCase } from "../src/adapters/WasmAdapter.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  AS_DESIGNED, GMP_HOST, GMP_LAYOUT_DICT, GMP_TEACHING_FILE, GMP_WITNESS, KNOBS, MOVES,
  TEACHING_LAYOUT, applyEdit, buildingLines, gmpCase, gmpCaseRaw, roomSpan,
  type GmpMove, type GmpPart,
} from "../src/ui/methods/gmpLayoutExercise.js";
import {
  GMP_LAYOUT_LIMITS, GMP_LAYOUT_STEPS, GMP_SOURCES,
} from "../src/ui/methods/gmpLayoutLesson.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tree = (rel: string): string => readFileSync(join(REPO, rel), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const PARTS = Object.keys(MOVES) as GmpPart[];

// ---- the registry -----------------------------------------------------------------

describe("GMP interior: the shelf, the kind and the dispatch", () => {
  const t = METHOD_TOOLS.find((m) => m.id === "gmp-layout");
  it("is a live construction on the Process design & economics shelf", () => {
    expect(t?.status).toBe("live");
    expect(t?.kind).toBe("construction");
    expect(t?.discipline).toBe("Process design & economics");
  });
  it("the workspace renders it", () => {
    expect(tree("gui/src/ui/MethodsWorkspace.tsx"))
      .toContain('tool === "gmp-layout" ? <GmpLayoutTool />');
  });
  it("links to the plant-layout page, and the plant-layout page links back", () => {
    expect(tree("gui/src/ui/methods/GmpLayoutTool.tsx"))
      .toContain('setActiveMethodTool("plant-layout")');
    expect(tree("gui/src/ui/methods/PlantLayoutTool.tsx"))
      .toContain('setActiveMethodTool("gmp-layout")');
  });
  it("sends the reader to a witness the bundled corpus carries, with a building", () => {
    const w = tutorialByName(GMP_WITNESS)?.files.rawFiles?.[GMP_LAYOUT_DICT];
    expect(w).toBeDefined();
    expect(w!).toMatch(/^building\s*$/m);
  });
});

// ---- the teaching building and its edits ------------------------------------------

describe("GMP interior: the teaching building and its edits", () => {
  it("is the committed file, and the host has no layoutDict of its own", () => {
    expect(TEACHING_LAYOUT).toBe(tree(GMP_TEACHING_FILE));
    expect(tutorialByName(GMP_HOST)?.files.rawFiles?.[GMP_LAYOUT_DICT]).toBeUndefined();
    expect(gmpCaseRaw([])[GMP_LAYOUT_DICT]).toBe(TEACHING_LAYOUT);
  });
  it("finds a room's whole entry, nested braces included", () => {
    const [a, b] = roomSpan(TEACHING_LAYOUT, "sprayDrying");
    const e = TEACHING_LAYOUT.slice(a, b);
    expect(e).toMatch(/^\{ room sprayDrying;/);
    expect(e).toContain("atex { zone 1;");
    expect(e.endsWith("} }")).toBe(true);
    expect(() => roomSpan(TEACHING_LAYOUT, "noSuchRoom")).toThrow(/noSuchRoom/);
  });
  it("every move's edits land exactly once, and change the file", () => {
    for (const p of PARTS)
      for (const m of MOVES[p]) {
        const out = gmpCaseRaw(m.edits)[GMP_LAYOUT_DICT]!;
        expect(out, `${p}/${m.id}`).not.toBe(TEACHING_LAYOUT);
      }
    for (const k of Object.values(KNOBS))
      expect(gmpCaseRaw([k!.edit(k!.shipped)])[GMP_LAYOUT_DICT]).toBe(TEACHING_LAYOUT);
  });
  it("an edit that misses, or that matches twice, refuses by name", () => {
    expect(() => applyEdit(TEACHING_LAYOUT, { from: "grade Q;", to: "x" })).toThrow(/not found/);
    expect(() => applyEdit(TEACHING_LAYOUT, { from: "grade D;", to: "x" }))
      .toThrow(/more than once/);
    expect(() => applyEdit(TEACHING_LAYOUT, { room: "warehouse", from: "grade D;", to: "x" }))
      .toThrow(/room `warehouse`/);
  });
  it("keeps the engine's building lines, the browser's stderr prefix removed, and drops the room-table heading", () => {
    const log = "x\n[building] teaching OSD block: 17 room(s) on 2 floor(s), 1 m2\n"
      + "[stderr] [building] pressure cascade: `a` ...\n"
      + "ERROR: layoutDict building: connection a -- b: a door joins\n";
    expect(buildingLines(log)).toEqual([
      "[building] pressure cascade: `a` ...",
      "ERROR: layoutDict building: connection a -- b: a door joins"]);
  });
});

// ---- the engine, natively ------------------------------------------------------------

interface Run { status: number | null; out: string; err: string;
  findings: string[] | null; building: Record<string, unknown> | null }

function runNative(edits: GmpMove["edits"]): Run {
  const bin = join(REPO, "choupoSolve");
  expect(existsSync(bin), `${bin} is absent -- run \`make all\` at the repository `
    + "root; this test runs the native engine and must not skip").toBe(true);
  const dir = mkdtempSync(join(tmpdir(), "choupo-c101-"));
  try {
    for (const [rel, body] of Object.entries(serialiseCase(gmpCase(edits)))) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    }
    const r = spawnSync(bin, [dir],
      { cwd: REPO, encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 });
    const out = r.stdout ?? "";
    const m = /<<<Choupo:result-begin>>>\s*\n([\s\S]*?)\n<<<Choupo:result-end>>>/.exec(out);
    const json = m ? JSON.parse(m[1]!) as { building?: { findings: { id: string }[] } } : null;
    const b = json?.building ?? null;
    return { status: r.status, out, err: r.stderr ?? "",
      findings: b ? b.findings.map((f) => f.id).sort() : null,
      building: b as Record<string, unknown> | null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("GMP interior: every move, run by the native engine", () => {
  it("the building as designed is published and raises nothing", () => {
    const r = runNative(AS_DESIGNED.edits);
    expect(r.status, r.err).toBe(0);
    expect(r.findings).toEqual([]);
    const b = r.building as { rooms: unknown[]; floors: unknown[]; flows: unknown[] };
    expect(b.rooms).toHaveLength(17);
    expect(b.floors).toHaveLength(2);
    expect(b.flows).toHaveLength(3);
  }, 60_000);
  for (const p of PARTS)
    for (const m of MOVES[p])
      it(`${p} / ${m.id}`, () => {
        const r = runNative(m.edits);
        if (m.refusal) {
          expect(r.status, r.err).toBe(2);
          expect(r.err).toContain(m.refusal);
          expect(m.findings).toEqual([]);
        } else {
          expect(r.status, r.err).toBe(0);
          expect(r.findings).toEqual([...m.findings].sort());
          //  And each finding reached the error stream, as the page prints it.
          expect(buildingLines(r.err).length).toBe(m.findings.length);
        }
      }, 60_000);
});

// ---- the numbers the lesson quotes -----------------------------------------------------

const all = prose(GMP_LAYOUT_STEPS.map((s) => `${s.title} ${s.body} ${s.note ?? ""}`).join(" "));
const moveText = prose(PARTS.flatMap((p) => MOVES[p].map((m) => m.expect)).join(" "));

describe("GMP interior: the numbers the lesson quotes", () => {
  it("the electrical room is about 7.3 m from the suite (6 m, 4 m, 1 m)", () => {
    const r = runNative([{ from: "atexSeparation { distance 6 m;",
                           to: "atexSeparation { distance 8 m;" }]);
    const b = r.building as { findings: { id: string; value: number }[] };
    const f = b.findings.find((x) => x.id === "atexIgnition:sprayDrying:electrical")!;
    expect(f.value.toFixed(1)).toBe("7.3");
    expect(f.value).toBeCloseTo(Math.hypot(6, 4, 1), 9);
    expect(all).toContain("about 7.3 m");
    expect(moveText).toContain("about 7.3 m");
  }, 60_000);
  it("the coating, packaging and exit-airlock pressures the lesson names", () => {
    const r = runNative([]);
    const rooms = (r.building as { rooms: { name: string; pressureToOutside: number }[] }).rooms;
    const p = (n: string) => rooms.find((x) => x.name === n)!.pressureToOutside;
    expect([p("coating"), p("packaging"), p("exitMAL")]).toEqual([25, 5, 15]);
    expect([p("sdIn"), p("sdOut"), p("sprayDrying")]).toEqual([5, 5, 15]);
    expect(all).toContain("coating room (grade D, 25 Pa)");
    expect(all).toContain("packaging (CNC, 5 Pa)");
    expect(all).toContain("cascade airlock at 15 Pa");
    expect(all).toContain("Its airlocks are sinks, at 5 Pa, and the suite itself is at 15 Pa");
  }, 60_000);
});

// ---- the lesson text ----------------------------------------------------------------------

describe("GMP interior: the lesson text", () => {
  it("quotes nothing", () => {
    expect(all).not.toMatch(/["“”]/);
    expect(moveText).not.toMatch(/["“”]/);
    for (const l of GMP_LAYOUT_LIMITS) expect(l.body).not.toMatch(/["“”]/);
    for (const s of GMP_SOURCES) expect(`${s.cite} ${s.used}`).not.toMatch(/["“”]/);
  });
  it("every equation parses", () => {
    for (const s of GMP_LAYOUT_STEPS) {
      if (s.formula) expect(texParses(s.formula), `step ${s.n}`).toBe(true);
      for (const g of s.where ?? []) expect(texParses(g.sym), `step ${s.n} ${g.sym}`).toBe(true);
    }
  });
  it("marks every guide it names as NOT READ, and the two texts read as read", () => {
    for (const id of ["ispe-osd", "ispe-risk", "who-hvac"])
      expect(GMP_SOURCES.find((s) => s.id === id)!.used).toContain("NOT READ");
    for (const id of ["annex1", "atex-1999-92", "record"])
      expect(GMP_SOURCES.find((s) => s.id === id)!.used).toMatch(/^read/);
    //  Annex 1's reuse basis, as the C97B record states it.
    expect(GMP_SOURCES.find((s) => s.id === "annex1")!.used).toContain("2011/833/EU");
  });
  it("the limits name the absences the GMP record names", () => {
    const record = tree("docs/design/a-gmp-interior-is-declared-and-checked.md");
    for (const w of ["door widths", "travel distances", "air-change rates", "HVAC"])
      expect(record).toContain(w);
    const limits = prose(GMP_LAYOUT_LIMITS.map((l) => `${l.title} ${l.body}`).join(" "));
    for (const w of ["air changes", "HVAC", "wide", "length of the route", "recovers",
                     "pipe or a duct"])
      expect(limits).toContain(w);
  });
  it("every file:line it cites lands on what it claims", () => {
    const src = tree("src/postProcessing/layout/BuildingLayout.cpp").split("\n");
    const line = (n: number): string => src[n - 1] ?? "";
    const span = (a: number, b: number): string => src.slice(a - 1, b).join("\n");
    const cited = new Set([...all.matchAll(/BuildingLayout\.cpp:(\d+)(?:-(\d+))?/g)]
      .map((m) => m[0]));
    const CLAIMS: Record<string, string | RegExp> = {
      "BuildingLayout.cpp:120-127":
        /int rankOf[\s\S]*grade == "A"\) return 4;[\s\S]*grade == "CNC"\) return 0;\s*return -1;/,
      "BuildingLayout.cpp:382": 'word(*e, "grade", w, { "A", "B", "C", "D", "CNC" })',
      "BuildingLayout.cpp:378-380": /word\(\*e, "role", w, \{ "room", "personnelAirlock",\s*"materialAirlock", "gowning" \}\)/,
      "BuildingLayout.cpp:383-384": /isAirlockRole\(r\.role\)\)\s*r\.regime = word\(\*e, "regime", w, \{ "cascade", "bubble", "sink" \}\)/,
      "BuildingLayout.cpp:480-484": /ox > kTol && oy > kTol && oz > kTol[\s\S]*two rooms cannot share a volume/,
      "BuildingLayout.cpp:80-83": /void announce[\s\S]*std::cerr << "\[building\] "[\s\S]*AdvisoryLog::instance\(\)\.add\("layout"/,
      "BuildingLayout.cpp:282-285": /!d\.found\("cascade"\)[\s\S]*no step is shipped here/,
      "BuildingLayout.cpp:460": "R[i].pressureToOutside = base + R[i].pressure;",
      "BuildingLayout.cpp:764": "if (rankS(clean) < 1) return;",
      "BuildingLayout.cpp:766-767": /if \(dp < step - kTolP\)\s*addFinding\("cascade"/,
      "BuildingLayout.cpp:778": "if (airlockS(l.a) || airlockS(l.b)) continue;",
      "BuildingLayout.cpp:804": 'R[i].regime == "bubble" && p - pmax < step - kTolP',
      "BuildingLayout.cpp:809": 'R[i].regime == "sink" && pmin - p < step - kTolP',
      "BuildingLayout.cpp:816-817": /margin = std::min\(p - pmin, pmax - p\);\s*if \(margin <= kTolP\)/,
      "BuildingLayout.cpp:822-825": /for \(std::size_t x = 0;[\s\S]*cascadeCheck\(nb\[x\], nb\[y\], " across airlock/,
      "BuildingLayout.cpp:860": 'if (airlockS(n) && R[n].regime == "sink") continue;',
      "BuildingLayout.cpp:855-856": /R\[n\]\.regime == "cascade"\)\s*addFinding\("containmentAccess"/,
      "BuildingLayout.cpp:925": "if (s == OUT) { gowned = -1; lastGown.clear(); continue; }",
      "BuildingLayout.cpp:927": 'if (r.role == "gowning") { gowned = rankOf(r.grade);',
      "BuildingLayout.cpp:930": "if (rk < 1) { gowned = -1; lastGown.clear(); continue; }",
      "BuildingLayout.cpp:931-932": /if \(rk > gowned\)\s*addFinding\("ungownedEntry"/,
      "BuildingLayout.cpp:396-397": /found\("containment"\)\)\s*r\.containment = word\(\*e, "containment", w, \{ "yes", "no" \}\) == "yes";/,
      "BuildingLayout.cpp:850-851": /if \(!airlockS\(n\)\)\s*addFinding\("containmentAccess"/,
      "BuildingLayout.cpp:862-863": /if \(dn < step - kTolP\)\s*addFinding\("containmentNotNegative"/,
      "BuildingLayout.cpp:760": "if (contS(u) != contS(v)) return;",
      "BuildingLayout.cpp:882-885": /if \(!connectedPair\(a, b\)\)[\s\S]*addFinding\("flowBreak"/,
      "BuildingLayout.cpp:896-900": /const bool wrong = personnel \? R\[s\]\.role == "materialAirlock"[\s\S]*addFinding\("wrongAirlock"/,
      "BuildingLayout.cpp:912-913": /if \(n != kOutside && !seen\.insert\(n\)\.second\)\s*addFinding\("materialRevisit"/,
      "BuildingLayout.cpp:946-951": /auto interior = [\s\S]*for \(std::size_t k = 1; k \+ 1 < f\.path\.size\(\); \+\+k\)/,
      "BuildingLayout.cpp:963-964": /if \(o\.kind == "personnel"\)\s*addFinding\("flowCrossing"/,
      "BuildingLayout.cpp:970": 'addFinding("wasteMeetsMaterial"',
      "BuildingLayout.cpp:723": 'sh.reason = text(*s, "reason", w);',
      "BuildingLayout.cpp:398-408": /found\("atex"\)[\s\S]*zi == 0 \|\| zi == 1 \|\| zi == 2 \|\| zi == 20 \|\| zi == 21 \|\| zi == 22/,
      "BuildingLayout.cpp:413": 'if (e->found("ignition")) r.ignition = text(*e, "ignition", w);',
      "BuildingLayout.cpp:197-204": /scalar boxGap[\s\S]*return std::sqrt\(gx \* gx \+ gy \* gy \+ gz \* gz\);/,
      "BuildingLayout.cpp:987-988": /!rec\.atexSeparationDeclared\)\s*addFinding\("atexSeparationUndeclared"/,
      "BuildingLayout.cpp:999-1000": /if \(a == g\)\s*addFinding\("atexIgnition"/,
      "BuildingLayout.cpp:1004-1005": /else if \(connectedPair\(a, g\)\)\s*addFinding\("atexIgnition"/,
      "BuildingLayout.cpp:1012-1014": /const scalar gap = boxGap\(R\[a\], R\[g\]\);\s*if \(gap < rec\.atexDistance - kTol\)\s*addFinding\("atexIgnition"/,
      "BuildingLayout.cpp:1034": 'if (e.second != "lift" && !seen[e.first])',
      "BuildingLayout.cpp:1042": 'addFinding("noEscape"',
      "BuildingLayout.cpp:558-561": /if \(R\[a\]\.floor != R\[b\]\.floor\)\s*refuse\(w \+ ": a door joins two rooms of ONE floor/,
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
  it("the refusal the escape move promises is the engine's own sentence", () => {
    const m = MOVES.escape.find((x) => x.id === "stair-door")!;
    expect(tree("src/postProcessing/layout/BuildingLayout.cpp")).toContain(m.refusal!);
  });
});
