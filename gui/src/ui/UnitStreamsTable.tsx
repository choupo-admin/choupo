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
  Compact per-unit streams table (stream · dir · F · mass · T · P · vf ·
  composition), in the user's display units.  Extracted from InternalsView's
  Streams tab so the What-if tab can show its run's outlet streams with the
  SAME table -- one implementation, two surfaces.
\*---------------------------------------------------------------------------*/

import { Table } from "@mantine/core";

import type { StreamResult } from "../adapters/SolverAdapter.js";
import { formatSig, formatFlow, formatPressure, formatTemperature, temperatureLabel } from "../state/displayUnits.js";
import { useStore } from "../state/store.js";
import { SortTh, useSortable } from "./SortableTable.js";

export function UnitStreamsTable({ groups }: {
  groups: Array<{ dir: string; streams: StreamResult[] }>;
}) {
  const prefs = useStore((st) => st.displayPrefs);
  const raw = groups.flatMap(({ dir, streams }) => streams.map((st) => {
    const parts = Object.entries(st.composition ?? {}).filter(([, x]) => (x as number) > 1e-4)
      .sort((a, b) => (b[1] as number) - (a[1] as number));
    return { st, dir, key: dir + st.name,
      comp: parts.map(([c, x]) => `${c} ${formatSig(x as number)}`).join(" · ") };
  }));
  const s = useSortable(raw, {
    stream: (r) => r.st.name, dir: (r) => r.dir, F: (r) => r.st.F,
    mass: (r) => r.st.F_mass, T: (r) => r.st.T, P: (r) => r.st.P,
    vf: (r) => r.st.vf, comp: (r) => r.comp,
  });
  const rows = s.rows.map(({ st, dir, key, comp }) => (
    <Table.Tr key={key}>
      <Table.Td>{st.name}</Table.Td><Table.Td c="dimmed">{dir}</Table.Td>
      <Table.Td ta="right">{formatFlow(st.F, prefs.flow)} {prefs.flow}</Table.Td>
      <Table.Td ta="right">{(st.F_mass != null ? formatSig(st.F_mass * 3600) : "—")} kg/h</Table.Td>
      <Table.Td ta="right">{formatTemperature(st.T, prefs.temperature)} {temperatureLabel(prefs.temperature)}</Table.Td>
      <Table.Td ta="right">{formatPressure(st.P, prefs.pressure)} {prefs.pressure}</Table.Td>
      <Table.Td ta="right">{st.vf != null ? formatSig(st.vf) : "—"}</Table.Td>
      <Table.Td>{comp || "—"}</Table.Td>
    </Table.Tr>
  ));
  return (
    <Table striped withTableBorder fz="sm" ff="monospace">
      <Table.Thead><Table.Tr>
        <SortTh s={s} k="stream">stream</SortTh><SortTh s={s} k="dir">dir</SortTh>
        <SortTh s={s} k="F">F</SortTh><SortTh s={s} k="mass">mass</SortTh>
        <SortTh s={s} k="T">T</SortTh><SortTh s={s} k="P">P</SortTh>
        <SortTh s={s} k="vf">vf</SortTh><SortTh s={s} k="comp">composition</SortTh>
      </Table.Tr></Table.Thead>
      <Table.Tbody>{rows}</Table.Tbody>
    </Table>
  );
}
