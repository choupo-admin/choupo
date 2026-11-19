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

/*  The compressor's datasheet trigger (DEV.md 4c C440 gap 4): a button that
 *  opens the engine's detailed design as a printable page, and the numbers as
 *  .ods.  Renders nothing until the run has written a sheet whose
 *  `compressor {}` block exists -- the power-only route draws no datasheet. */
import { Button, Group, Stack, Text } from "@mantine/core";
import { IconFileText, IconTableExport } from "@tabler/icons-react";
import { useStore } from "../state/store.js";
import type { UnitSpec } from "../case/types.js";
import { lookupDesignSheet } from "../case/designSheet.js";
import { compressorDatasheetHtml, compressorOdsRows, compressorView }
  from "../case/compressorDatasheet.js";
import { downloadOds } from "../case/odsExport.js";

export function CompressorDatasheet({ unit }: { unit: UnitSpec }) {
  const designFiles = useStore((s) => s.runResult?.designFiles);
  const view = compressorView(lookupDesignSheet(designFiles, unit.name, "compressor").sheet);
  if (!view) return null;
  const openTab = () => {
    const url = URL.createObjectURL(
      new Blob([compressorDatasheetHtml(view)], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  return (
    <Stack gap={6}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Compressor design</Text>
      <Text size="xs">{view.machine} ({view.machineBy}), {view.stages.length} section(s)</Text>
      <Group gap="xs">
        <Button size="compact-sm" variant="light" leftSection={<IconFileText size={14} />}
          onClick={openTab}>Open datasheet</Button>
        <Button size="compact-sm" variant="subtle" leftSection={<IconTableExport size={14} />}
          onClick={() => downloadOds(unit.name, ["quantity", "value", "unit", "source"],
            compressorOdsRows(view), `${unit.name}_compressor.ods`)}>Numbers (.ods)</Button>
      </Group>
    </Stack>
  );
}
