/*---------------------------------------------------------------------------*\
  A CASE'S IDENTITY IS ITS SLUG, AND THE FOLDER KEEPS ITS OWN NAME.

  The GUI's importer materialises a case under `slugifyName(name)`, and its
  own "same name = SAME case" guard compared that slug against a folder NAME.
  `slugifyName` lowercases, so a folder the authoring guide itself asks for
  (`PascalCase` on a case root, decided 2026-05-27) can never equal its own
  slug: the guard never fired and the import wrote a lowercase COPY beside the
  student's case, which the GUI then worked on while the folder they had
  opened stood still.  Vitor met it twice in a row building the PEQ green
  ammonia case -- `GreenAmmoniaIndustrialN2` -> `greenammoniaindustrialn2`,
  then `greenNH3_04_industrialN2_sectored` -> `greennh3_04_industrialn2_sectored`.

  These are BEHAVIOURAL tests, which is why the rule was extracted into
  `bridge/caseSlug.mjs`: `claudeBridge.mjs` opens a server the moment it is
  imported, so everything in it can only be checked by reading the source, and
  a rule nobody can run is a rule nobody can sabotage-test.

  NOT CHECKED HERE: that the bridge CALLS this (a source arm below), and
  nothing about the server, the filesystem or the teaching files.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { slugifyName, adoptExistingCase } from "../bridge/caseSlug.mjs";

describe("slugifyName", () => {
  it("is what makes a PascalCase folder differ from its own slug", () => {
    //  The premise of the whole defect, pinned so it cannot go quiet.
    expect(slugifyName("GreenAmmoniaIndustrialN2")).toBe("greenammoniaindustrialn2");
    expect(slugifyName("GreenAmmoniaIndustrialN2")).not.toBe("GreenAmmoniaIndustrialN2");
    expect(slugifyName("greenNH3_04_industrialN2_sectored"))
      .toBe("greennh3_04_industrialn2_sectored");
  });

  it("is idempotent on a name that is already a slug", () => {
    expect(slugifyName("green-ammonia-industrial-n2")).toBe("green-ammonia-industrial-n2");
  });
});

describe("adoptExistingCase", () => {
  it("adopts the folder the student named, keeping that name", () => {
    const got = adoptExistingCase("greenammoniaindustrialn2",
      ["GreenAmmoniaIndustrialN2", "flash01"]);
    expect(got).toEqual({ name: "GreenAmmoniaIndustrialN2" });
  });

  it("returns null when nothing answers to the slug -- a genuinely new case", () => {
    expect(adoptExistingCase("brandnew", ["GreenAmmoniaIndustrialN2"])).toBeNull();
    expect(adoptExistingCase("brandnew", [])).toBeNull();
  });

  it("prefers an EXACT folder name over one that merely slugifies to it", () => {
    //  The more specific match, and what every case imported before this
    //  resolved to -- so nothing already on disk moves.
    const got = adoptExistingCase("mycase", ["MyCase", "mycase"]);
    expect(got).toEqual({ name: "mycase" });
  });

  it("REFUSES two different folders claiming one slug, naming both", () => {
    //  No defensible answer, so no answer: the third option of the report
    //  that found this (refuse and say what to do), never a silent pick.
    const got = adoptExistingCase("mycase", ["MyCase", "myCase"]);
    expect(got).not.toBeNull();
    expect(got).not.toHaveProperty("name");
    const err = (got as { error: string }).error;
    expect(err).toBeTruthy();
    expect(err).toContain("MyCase");
    expect(err).toContain("myCase");
  });
});

describe("the bridge reads that one home rather than keeping its own", () => {
  const BRIDGE = readFileSync(
    new URL("../bridge/claudeBridge.mjs", import.meta.url), "utf-8");

  it("imports the rule and defines neither function itself", () => {
    expect(BRIDGE).toContain('from "./caseSlug.mjs"');
    expect(BRIDGE).not.toContain("function slugifyName");
    expect(BRIDGE).not.toContain("function adoptExistingCase");
  });

  it("consults it on the import path before choosing a folder", () => {
    expect(BRIDGE).toContain("adoptExistingCase(slug, siblings)");
  });
});
