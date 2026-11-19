/*---------------------------------------------------------------------------*\
  PipeRegisterDock -- the pipe register docked BESIDE the 3D view (DEV.md 4c
  C91).  Sortable on every column (the shared SortableTable); clicking a row
  selects the pipe in the view (highlight + card), and a pipe clicked in the
  view selects its row.  Size, velocity and drop come from the line sheets
  (C207) and are blank where the case sized none.

  Licence: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef } from "react";
import { ScrollArea, Table, Text } from "@mantine/core";
import type { PlantLayout } from "../adapters/SolverAdapter.js";
import { dockedPipeRows, type DockedPipeRow } from "../case/pipeRegisterRows.js";
import { SortTh, useSortable } from "./SortableTable.js";

export function PipeRegisterDock({ layout, selected, onSelect }: {
  layout: PlantLayout; selected: string | null; onSelect: (id: string | null) => void;
}) {
  const rows = useMemo(() => dockedPipeRows(layout), [layout]);
  const s = useSortable<DockedPipeRow>(rows, {
    tag: (r) => r.tag, ends: (r) => r.ends, nps: (r) => r.nps, length: (r) => r.length,
    velocity: (r) => r.velocity, drop: (r) => r.dropKPa,
  });
  const selRow = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => { selRow.current?.scrollIntoView?.({ block: "nearest" }); }, [selected]);
  const any = rows.some((r) => r.sized);
  const f = (v: number | null, d: number) => (v === null ? "" : v.toFixed(d));
  return (
    <div data-pipe-register-dock style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Text size="xs" c="dimmed" px="xs" py={4}>
        {rows.length} pipes.  Click a row to find the pipe in the view.
        {!any && " Size, velocity and drop are blank: this case declares no lineDesign."}
      </Text>
      <ScrollArea type="auto" style={{ flex: 1, minHeight: 0 }}>
        <Table striped withTableBorder fz="xs" ff="monospace" stickyHeader>
          <Table.Thead><Table.Tr>
            <SortTh s={s} k="tag">Tag</SortTh>
            <SortTh s={s} k="ends">From → to</SortTh>
            <SortTh s={s} k="nps">NPS (in)</SortTh>
            <SortTh s={s} k="length">L (m)</SortTh>
            <SortTh s={s} k="velocity">v (m/s)</SortTh>
            <SortTh s={s} k="drop">ΔP (kPa)</SortTh>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {s.rows.map((r) => {
              const on = r.id === selected;
              return (
                <Table.Tr key={r.id} data-pipe-row={r.id} data-selected={on || undefined}
                  ref={on ? selRow : undefined} onClick={() => onSelect(on ? null : r.id)}
                  style={{ cursor: "pointer",
                    background: on ? "var(--mantine-color-cyan-light)" : undefined }}>
                  <Table.Td>{r.tag}</Table.Td>
                  <Table.Td>{r.ends}</Table.Td>
                  <Table.Td ta="right">{f(r.nps, 1)}</Table.Td>
                  <Table.Td ta="right">{r.length.toFixed(1)}</Table.Td>
                  <Table.Td ta="right">{f(r.velocity, 2)}</Table.Td>
                  <Table.Td ta="right">{f(r.dropKPa, 1)}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </div>
  );
}
