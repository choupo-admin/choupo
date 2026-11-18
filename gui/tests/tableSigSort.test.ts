/*---------------------------------------------------------------------------*\
  C307 slice 2: the streams / unit / reports tables follow the
  significant-figures preference (displayUnits.formatSig, the one home) and
  sort by clicking a header (SortableTable, the one component).
  Licence: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { sortRows } from "../src/ui/SortableTable.js";

vi.mock("../src/state/store.js", async () => {
  const { DEFAULT_PREFS } = await import("../src/state/displayUnits.js");
  return {
    useStore: Object.assign(
      (sel: (s: unknown) => unknown) => sel({ displayPrefs: { ...DEFAULT_PREFS } }),
      { getState: () => ({ displayPrefs: { ...DEFAULT_PREFS } }) }),
  };
});

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("UnitStreamsTable", () => {
  it("shows three significant figures and carries sortable headers", async () => {
    const { UnitStreamsTable } = await import("../src/ui/UnitStreamsTable.js");
    const st = { name: "S1", F: 12.3456789, F_mass: 0.123456789, T: 351.23456, P: 101325.7,
      vf: 0.123456, composition: { water: 0.987654, ethanol: 0.012346 } } as never;
    const html = renderToStaticMarkup(createElement(MantineProvider, null,
      createElement(UnitStreamsTable, { groups: [{ dir: "in", streams: [st] }] })));
    const t = text(html);
    expect(t).toContain("0.123");
    expect(t).toContain("444 kg/h");
    expect(t).toContain("water 0.988 · ethanol 0.0123");
    expect(t).not.toMatch(/12\.34|0\.1235|0\.9877/);
    expect((html.match(/data-sortable=/g) ?? []).length).toBe(8);
  });
});

describe("the sort rule the tables share", () => {
  it("sorts numbers numerically, missing last", () => {
    const rows = [{ v: 10 }, { v: 9 }, { v: undefined }, { v: 100 }];
    expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.v)).toEqual([9, 10, 100, undefined]);
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.v)).toEqual([100, 10, 9, undefined]);
  });
});
