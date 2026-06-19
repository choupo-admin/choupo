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
import { formatFlow, formatPressure, formatTemperature, temperatureLabel } from "../state/displayUnits.js";
import { useStore } from "../state/store.js";

export function UnitStreamsTable({ groups }: {
  groups: Array<{ dir: string; streams: StreamResult[] }>;
}) {
  const prefs = useStore((st) => st.displayPrefs);
  const rows = groups.flatMap(({ dir, streams }) => streams.map((st) => {
    const comp = Object.entries(st.composition ?? {}).filter(([, x]) => (x as number) > 1e-4)
      .sort((a, b) => (b[1] as number) - (a[1] as number)).map(([c, x]) => `${c} ${(x as number).toFixed(3)}`).join(" · ");
    return (
      <Table.Tr key={dir + st.name}>
        <Table.Td>{st.name}</Table.Td><Table.Td c="dimmed">{dir}</Table.Td>
        <Table.Td ta="right">{formatFlow(st.F, prefs.flow, 4)} {prefs.flow}</Table.Td>
        <Table.Td ta="right">{(st.F_mass != null ? (st.F_mass * 3600).toFixed(1) : "—")} kg/h</Table.Td>
        <Table.Td ta="right">{formatTemperature(st.T, prefs.temperature, 2)} {temperatureLabel(prefs.temperature)}</Table.Td>
        <Table.Td ta="right">{formatPressure(st.P, prefs.pressure, 3)} {prefs.pressure}</Table.Td>
        <Table.Td ta="right">{st.vf != null ? st.vf.toFixed(3) : "—"}</Table.Td>
        <Table.Td>{comp || "—"}</Table.Td>
      </Table.Tr>
    );
  }));
  return (
    <Table striped withTableBorder fz="sm" ff="monospace">
      <Table.Thead><Table.Tr>
        <Table.Th>stream</Table.Th><Table.Th>dir</Table.Th>
        <Table.Th ta="right">F</Table.Th><Table.Th ta="right">mass</Table.Th>
        <Table.Th ta="right">T</Table.Th><Table.Th ta="right">P</Table.Th>
        <Table.Th ta="right">vf</Table.Th><Table.Th>composition</Table.Th>
      </Table.Tr></Table.Thead>
      <Table.Tbody>{rows}</Table.Tbody>
    </Table>
  );
}
