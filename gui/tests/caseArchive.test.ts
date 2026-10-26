/*---------------------------------------------------------------------------*\
  caseArchive -- the ONE case inside a .zip a student made (DEV.md 4c C107).

  Fixtures are built here, in memory, from a REAL tutorial's files, in the
  shapes students' own tools produce: macOS "Compress" (__MACOSX/ + ._* +
  .DS_Store), Windows "Send to compressed folder" (one wrapping folder), a
  zip of the case's CONTENTS (no folder), a case two folders deep, and a
  sectored plant (nested system/controlDict that must NOT read as two cases).
  Plus the refusals and the round trip through "Download case (.zip)".
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  CaseArchiveRefusal, caseFromEntries, caseFromZipBytes, findCaseRoots,
  isOsJunk, sniffArchive,
} from "../src/cases/caseArchive.js";
import {
  FOLDER_FILE_LIMIT_BYTES, openedCaseFromFolder, openedCaseFromZip, readFolderFileList,
  readFolderHandle, type FileSystemDirectoryHandleLike, type FileSystemHandleLike,
  type OpenedCase,
} from "../src/cases/loadCase.js";
import { buildCaseZip } from "../src/case/saveCase.js";
import { caseTeachingFiles } from "../src/case/caseTeaching.js";

const REPO = join(__dirname, "..", "..");

/** The tracked files of a tutorial, {rel: text}. */
function tutorialFiles(rel: string): { [p: string]: string } {
  const listed = execFileSync("git", ["ls-files", rel], { cwd: REPO, encoding: "utf8" })
    .split("\n").filter(Boolean);
  const out: { [p: string]: string } = {};
  for (const p of listed) out[p.slice(rel.length + 1)] = readFileSync(join(REPO, p), "utf8");
  return out;
}

const FLASH = "tutorials/steady/flash/flash01_benzene_toluene";
const CASE = tutorialFiles(FLASH);

function under(prefix: string, files: { [p: string]: string }) {
  const out: { [p: string]: Uint8Array } = {};
  for (const [p, t] of Object.entries(files)) out[prefix + p] = strToU8(t);
  return out;
}

/** AppleDouble header: what a ._ file starts with (binary, NUL bytes). */
const APPLE_DOUBLE = new Uint8Array([0x00, 0x05, 0x16, 0x07, 0x00, 0x02, 0x00, 0x00]);
/** The first bytes of a PDF with its binary marker line, and a NUL. */
const PDF = new Uint8Array([...strToU8("%PDF-1.7\n%"), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x00, 0x01]);
/** PNG signature. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function expectSameCase(got: { [p: string]: string }) {
  expect(Object.keys(got).sort()).toEqual(Object.keys(CASE).sort());
  for (const [p, t] of Object.entries(CASE)) expect(got[p]).toBe(t);
}

describe("the zips students make", () => {
  it("macOS Compress: __MACOSX/, ._* and .DS_Store are dropped by name", () => {
    const entries: { [p: string]: Uint8Array } = {
      ...under("flash01/", CASE),
      "flash01/.DS_Store": new Uint8Array([0, 0, 0, 1, 0x42, 0x75, 0x64, 0x31]),
      "flash01/system/.DS_Store": new Uint8Array([0, 0, 0, 1]),
      "__MACOSX/": new Uint8Array(),
      "__MACOSX/flash01/._system": APPLE_DOUBLE,
      "__MACOSX/flash01/system/._controlDict": APPLE_DOUBLE,
      "__MACOSX/flash01/._.DS_Store": APPLE_DOUBLE,
    };
    const c = caseFromEntries(entries, "flash01.zip");
    expect(c.root).toBe("flash01");
    expect(c.name).toBe("flash01");
    expectSameCase(c.files);
    expect(c.notices).toEqual([]);            // junk is never worth a notice
  });

  it("Windows Send to compressed folder: one wrapping folder (and directory entries)", () => {
    const entries = { "flash01_benzene_toluene/": new Uint8Array(),
      "flash01_benzene_toluene/system/": new Uint8Array(),
      ...under("flash01_benzene_toluene/", CASE),
      "flash01_benzene_toluene/Thumbs.db": PNG };
    const c = caseFromEntries(entries, "flash01_benzene_toluene.zip");
    expect(c.name).toBe("flash01_benzene_toluene");
    expectSameCase(c.files);
  });

  it("backslash separators from an old Windows tool are read as folders", () => {
    const entries: { [p: string]: Uint8Array } = {};
    for (const [p, b] of Object.entries(under("mycase\\", CASE))) entries[p.replace(/\//g, "\\")] = b;
    const c = caseFromEntries(entries, "mycase.zip");
    expect(c.root).toBe("mycase");
    expectSameCase(c.files);
  });

  it("a zip of the case's CONTENTS (no wrapping folder) takes the archive's name", () => {
    const c = caseFromEntries(under("", CASE), "my flash.zip");
    expect(c.root).toBe("");
    expect(c.name).toBe("my flash");
    expectSameCase(c.files);
  });

  it("a case two folders deep; what sits beside it is named, not opened", () => {
    const entries = { ...under("Downloads/project/flash01/", CASE),
      "Downloads/notes.txt": strToU8("remember the tray efficiency"),
      "Downloads/project/README.txt": strToU8("group 7") };
    const c = caseFromEntries(entries, "project.zip");
    expect(c.root).toBe("Downloads/project/flash01");
    expect(c.name).toBe("flash01");
    expectSameCase(c.files);
    expect(c.notices).toHaveLength(1);
    expect(c.notices[0]).toMatch(/outside the case folder/);
    expect(c.notices[0]).toContain("Downloads/notes.txt");
    expect(c.notices[0]).toContain("Downloads/project/README.txt");
  });

  it("a PDF and a picture in the case folder are left out and NAMED, the case intact", () => {
    const entries = { ...under("flash01/", CASE),
      "flash01/docs/report.pdf": PDF, "flash01/pfd.png": PNG };
    const c = caseFromEntries(entries, "flash01.zip");
    expectSameCase(c.files);
    expect(c.notices).toHaveLength(1);
    expect(c.notices[0]).toMatch(/not text/);
    expect(c.notices[0]).toContain("docs/report.pdf");
    expect(c.notices[0]).toContain("pfd.png");
  });

  it("run outputs are not read (the same SKIP the folder reader applies)", () => {
    const entries = { ...under("flash01/", CASE),
      "flash01/log.choupoSolve": strToU8("Newton ..."),
      "flash01/reports/massBalance.csv": strToU8("a,b"),
      "flash01/.git/HEAD": strToU8("ref: refs/heads/main") };
    expectSameCase(caseFromEntries(entries, "flash01.zip").files);
  });

  it("a sectored plant's own sector controlDicts do not make it several cases", () => {
    const plant = tutorialFiles("tutorials/plant/twoSectorDemo");
    expect(Object.keys(plant).filter((p) => p.endsWith("system/controlDict"))).toHaveLength(3);
    const c = caseFromEntries(under("twoSectorDemo/", plant), "twoSectorDemo.zip");
    expect(c.root).toBe("twoSectorDemo");
    expect(Object.keys(c.files).sort()).toEqual(Object.keys(plant).sort());
  });
});

describe("refusals a student can act on", () => {
  it("no system/controlDict anywhere", () => {
    const entries = { "homework/flowsheet.txt": strToU8("units ( )"),
      "__MACOSX/homework/system/._controlDict": APPLE_DOUBLE };
    expect(() => caseFromEntries(entries, "homework.zip")).toThrow(CaseArchiveRefusal);
    expect(() => caseFromEntries(entries, "homework.zip"))
      .toThrow(/holds no Choupo case.*system\/controlDict/);
  });

  it("two cases side by side: both roots are named", () => {
    const entries = { ...under("group7/caseA/", CASE), ...under("group7/caseB/", CASE) };
    expect(() => caseFromEntries(entries, "group7.zip"))
      .toThrow(/holds 2 cases, not one: group7\/caseA, group7\/caseB/);
  });

  it("roots nest by FOLDER, never by name prefix; the outermost wins", () => {
    expect(findCaseRoots(["system/controlDict", "other/system/controlDict"])).toEqual([""]);
    expect(findCaseRoots(["a/system/controlDict", "b/system/controlDict"])).toEqual(["a", "b"]);
    expect(findCaseRoots(["a/system/controlDict", "a/S/system/controlDict"])).toEqual(["a"]);
    expect(findCaseRoots(["ab/system/controlDict", "a/system/controlDict"])).toEqual(["a", "ab"]);
  });

  it("RAR, 7z and tar.gz are refused by name, saying: save it as .zip", () => {
    const rar = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]);
    const sz = new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
    const gz = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]);
    expect(sniffArchive(rar)).toBe("rar");
    expect(() => caseFromZipBytes(rar, "case.rar")).toThrow(/a RAR archive.*save it as \.zip/);
    expect(() => caseFromZipBytes(sz, "case.7z")).toThrow(/a 7-Zip archive.*save it as \.zip/);
    expect(() => caseFromZipBytes(gz, "case.tar.gz")).toThrow(/\.tar\.gz.*save it as \.zip/);
    expect(() => caseFromZipBytes(strToU8("hello"), "case.zip")).toThrow(/not a \.zip archive/);
  });

  it("a damaged .zip refuses with the remedy, not a library trace", () => {
    const good = zipSync(under("flash01/", CASE));
    const cut = good.slice(0, Math.floor(good.length / 3));
    expect(() => caseFromZipBytes(cut, "flash01.zip")).toThrow(CaseArchiveRefusal);
  });
});

describe("OS junk by name", () => {
  it.each([
    ["__MACOSX/x/._a", true], ["x/.DS_Store", true], ["x/._controlDict", true],
    ["x/Thumbs.db", true], ["x/desktop.ini", true],
    ["x/system/controlDict", false], ["x/.cho", false], ["x/_dist/a", false],
  ])("%s -> %s", (p, junk) => expect(isOsJunk(p)).toBe(junk));
});

describe("round trip: Download case (.zip) opens back to the same files", () => {
  it("every case file comes back byte-identical; only the teaching files and CITATION.txt are added", () => {
    const opened0 = openedCaseFromZip(zipSync(under("", CASE)), "flash01_benzene_toluene.zip");
    const built = buildCaseZip(opened0.files, "flash01_benzene_toluene");
    expect(built).not.toBeNull();
    expect(built!.fileName).toBe("flash01_benzene_toluene.zip");
    const back = openedCaseFromZip(built!.bytes, built!.fileName);
    expect(back.name).toBe("flash01_benzene_toluene");
    expect(back.notices).toBeUndefined();
    const teaching = Object.keys(caseTeachingFiles());
    const extra = Object.keys(back.raw).filter((p) => !(p in CASE)).sort();
    //  + the generated citation (DEV.md 4c C171 B; tests/citation.test.ts)
    expect(extra).toEqual([...teaching.filter((p) => !(p in CASE)), "CITATION.txt"].sort());
    for (const [p, t] of Object.entries(CASE)) expect(back.raw[p]).toBe(t);
    // And the parsed case is the same case.
    expect(back.files.controlDict).toEqual(opened0.files.controlDict);
    expect(back.files.flowsheet).toEqual(opened0.files.flowsheet);
  });
});

// ---- the FOLDER route: File -> "Open Case folder..." (DEV.md 4c C110 G6) ----
//
// It used to keep its own reader: no case-root rule and every file decoded
// as text.  Both browser routes are driven here with plain objects -- a
// directory handle (showDirectoryPicker) and a webkitdirectory file list --
// so the readers themselves are tested, not only the rule they now call.

type Tree = { [name: string]: Tree | Uint8Array };

/** A tree of paths -> a fake FileSystemDirectoryHandle. */
function handleOf(name: string, files: { [p: string]: Uint8Array }): FileSystemDirectoryHandleLike {
  const root: Tree = {};
  for (const [p, b] of Object.entries(files)) {
    const segs = p.split("/");
    let node = root;
    for (const s of segs.slice(0, -1)) node = (node[s] ??= {}) as Tree;
    node[segs[segs.length - 1]!] = b;
  }
  const dirOf = (n: string, t: Tree): FileSystemDirectoryHandleLike & FileSystemHandleLike => ({
    kind: "directory", name: n,
    async *values() {
      for (const [k, v] of Object.entries(t))
        yield v instanceof Uint8Array
          ? { kind: "file" as const, name: k, getFile: async () => new File([v as BlobPart], k) }
          : dirOf(k, v);
    },
  });
  return dirOf(name, root);
}

/** The same files as an <input webkitdirectory> list (paths carry the folder). */
function fileListOf(name: string, files: { [p: string]: Uint8Array }): File[] {
  return Object.entries(files).map(([p, b]) => {
    const f = new File([b as BlobPart], p.split("/").pop()!);
    Object.defineProperty(f, "webkitRelativePath", { value: `${name}/${p}` });
    return f;
  });
}

describe("Open Case folder: the same rule as the .zip", () => {
  const routes: [string, (n: string, f: { [p: string]: Uint8Array }) => Promise<OpenedCase>][] = [
    ["directory picker", (n, f) => readFolderHandle(handleOf(n, f))],
    ["webkitdirectory", (n, f) => readFolderFileList(fileListOf(n, f))],
  ];

  it.each(routes)("%s: the case folder itself opens, junk dropped in silence", async (_, open) => {
    const c = await open("flash01", { ...under("", CASE), ".DS_Store": new Uint8Array([0, 0, 1]) });
    expect(c.name).toBe("flash01");
    expectSameCase(c.raw);
    expect(c.notices).toBeUndefined();
  });

  it.each(routes)("%s: a PARENT folder opens its one case and names the file beside it", async (_, open) => {
    const c = await open("homework", { ...under("flash01/", CASE), "notes.txt": strToU8("hi") });
    expect(c.name).toBe("flash01");
    expectSameCase(c.raw);
    expect(c.notices).toEqual([`Left out 1 file(s) outside the case folder “flash01”: notes.txt.`]);
  });

  it.each(routes)("%s: a PDF in the case folder is left out and NAMED, never decoded", async (_, open) => {
    const c = await open("flash01", { ...under("", CASE), "docs/report.pdf": PDF });
    expect(c.raw["docs/report.pdf"]).toBeUndefined();
    expect(c.notices).toEqual([`Left out 1 file(s) that are not text (a case is read as text): docs/report.pdf.`]);
  });

  it.each(routes)("%s: a file over the size limit is left out and NAMED", async (_, open) => {
    const big = new Uint8Array(FOLDER_FILE_LIMIT_BYTES + 1).fill(0x41);
    const c = await open("flash01", { ...under("", CASE), "movie.txt": big });
    expect(c.raw["movie.txt"]).toBeUndefined();
    expect(c.notices).toEqual([`Left out 1 file(s) larger than 4 MB: movie.txt.`]);
  });

  it.each(routes)("%s: no case, or two, REFUSES naming the folder -- in folder words", async (_, open) => {
    await expect(open("Downloads", { "a.txt": strToU8("x") }))
      .rejects.toThrow(/“Downloads” holds no Choupo case.*pick that folder/);
    await expect(open("group7", { ...under("caseA/", CASE), ...under("caseB/", CASE) }))
      .rejects.toThrow(/holds 2 cases, not one: caseA, caseB.*pick one case folder/);
    await expect(open("Downloads", { "a.txt": strToU8("x") }))
      .rejects.not.toThrow(/compress|\.zip/);
  });

  it("a sectored plant's own sector controlDicts do not read as more cases", async () => {
    const plant = tutorialFiles("tutorials/plant/twoSectorDemo");
    const c = await readFolderHandle(handleOf("twoSectorDemo", under("", plant)));
    expect(c.name).toBe("twoSectorDemo");
    expect(Object.keys(c.raw).sort()).toEqual(Object.keys(plant).sort());
  });

  it("openedCaseFromFolder is the funnel both readers call", () => {
    const c = openedCaseFromFolder(under("", CASE), "flash01");
    expect(c.files.flowsheet)
      .toEqual(openedCaseFromZip(zipSync(under("", CASE)), "flash01.zip").files.flowsheet);
  });
});
