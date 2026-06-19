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

// artifactChips -- the console's CSV-artifact chip logic (message guards +
// the latest-first / deduped / capped chip-list reducer).

import { describe, expect, it } from "vitest";

import {
  MAX_CHIPS, asArtifactContent, asArtifactError, asArtifactMessage,
  dismissChip, pushChip, type ArtifactChip,
} from "../src/agent/artifactChips.js";

const chip = (rel: string, mtimeMs = 1000): ArtifactChip => ({ rel, size: 42, mtimeMs });

describe("asArtifactMessage", () => {
  it("accepts a well-formed announcement", () => {
    expect(asArtifactMessage({ type: "artifact", rel: "sweep_results.csv", size: 7, mtimeMs: 99 }))
      .toEqual({ rel: "sweep_results.csv", size: 7, mtimeMs: 99 });
  });

  it("defaults missing/odd size + mtime to 0", () => {
    expect(asArtifactMessage({ type: "artifact", rel: "a.csv" }))
      .toEqual({ rel: "a.csv", size: 0, mtimeMs: 0 });
    expect(asArtifactMessage({ type: "artifact", rel: "a.csv", size: NaN, mtimeMs: "x" }))
      .toEqual({ rel: "a.csv", size: 0, mtimeMs: 0 });
  });

  it("rejects other message types, empty rel and non-objects", () => {
    expect(asArtifactMessage({ type: "data", data: "x" })).toBeNull();
    expect(asArtifactMessage({ type: "artifact", rel: "" })).toBeNull();
    expect(asArtifactMessage({ type: "artifact" })).toBeNull();
    expect(asArtifactMessage("artifact")).toBeNull();
    expect(asArtifactMessage(null)).toBeNull();
  });
});

describe("asArtifactContent / asArtifactError", () => {
  it("parses a content reply", () => {
    expect(asArtifactContent({ type: "artifactContent", rel: "a.csv", text: "x,y\n1,2" }))
      .toEqual({ rel: "a.csv", text: "x,y\n1,2" });
  });

  it("rejects content replies without text", () => {
    expect(asArtifactContent({ type: "artifactContent", rel: "a.csv" })).toBeNull();
    expect(asArtifactContent({ type: "artifact", rel: "a.csv", text: "t" })).toBeNull();
  });

  it("parses an error reply (message optional)", () => {
    expect(asArtifactError({ type: "artifactError", rel: "a.csv", error: "too large" }))
      .toEqual({ rel: "a.csv", error: "too large" });
    expect(asArtifactError({ type: "artifactError", rel: "a.csv" }))
      .toEqual({ rel: "a.csv", error: "unknown error" });
    expect(asArtifactError({ type: "artifactContent", rel: "a.csv", text: "" })).toBeNull();
  });
});

describe("pushChip", () => {
  it("adds latest first", () => {
    const out = pushChip([chip("a.csv")], chip("b.csv"));
    expect(out.map((c) => c.rel)).toEqual(["b.csv", "a.csv"]);
  });

  it("dedupes by rel: a rewritten CSV moves to the front with the new mtime", () => {
    const list = [chip("a.csv", 1), chip("b.csv", 2)];
    const out = pushChip(list, chip("b.csv", 9));
    expect(out.map((c) => c.rel)).toEqual(["b.csv", "a.csv"]);
    expect(out[0]!.mtimeMs).toBe(9);
    expect(out).toHaveLength(2);
  });

  it(`caps at MAX_CHIPS (${MAX_CHIPS}), dropping the oldest`, () => {
    let list: ArtifactChip[] = [];
    for (let i = 0; i < MAX_CHIPS + 2; ++i) list = pushChip(list, chip(`f${i}.csv`));
    expect(list).toHaveLength(MAX_CHIPS);
    expect(list[0]!.rel).toBe(`f${MAX_CHIPS + 1}.csv`);     // newest kept
    expect(list.some((c) => c.rel === "f0.csv")).toBe(false); // oldest dropped
    expect(list.some((c) => c.rel === "f1.csv")).toBe(false);
  });
});

describe("dismissChip", () => {
  it("removes exactly the dismissed rel", () => {
    const list = [chip("a.csv"), chip("b.csv")];
    expect(dismissChip(list, "a.csv").map((c) => c.rel)).toEqual(["b.csv"]);
    expect(dismissChip(list, "zz.csv")).toHaveLength(2);
  });
});
