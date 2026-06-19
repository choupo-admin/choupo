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
  NewCaseModal -- "File / New Case...".  Creates an EMPTY case in a folder you
  CHOOSE, and opens it in the CURATION phase.

  Creating a case INITIALISES a folder (it is not just written at the end), so
  the target folder is picked up front: the navigator opens at the workspace but
  you can browse anywhere in your tree (the bridge fences writes to $HOME /
  project / workspace).  The deterministic 5-file skeleton is written by the
  bridge -- this React app only issues the create-intent (runner, not editor).
  It authors NO physics (empty components/units); you fill the dicts in an editor
  or via the Assistant console.  The problem statement seeds the case CLAUDE.md.
\*---------------------------------------------------------------------------*/

import { useState } from "react";
import { Alert, Button, Group, Loader, Modal, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { IconFilePlus, IconAlertTriangle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

import { useStore } from "../state/store.js";
import { createCase, setWorkspace, CASE_NAME_RE } from "../cases/workspace.js";
import { useFolderNav, Breadcrumb, FolderRows } from "./FolderNav.js";

export function NewCaseModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const loadLocalCase = useStore((s) => s.loadLocalCase);
  const { cur, error: navError, loading, go } = useFolderNav(opened);

  const [name, setName] = useState("");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOk = CASE_NAME_RE.test(name);
  const nameError = name.length > 0 && !nameOk
    ? "Letters, digits, '-' and '_' only (no spaces, no '/')."
    : null;
  const clash = !!cur && nameOk && cur.entries.some((e) => e.name === name);

  const close = () => { setName(""); setStatement(""); setError(null); setBusy(false); onClose(); };

  const changeWorkspace = (dir: string) => {
    setWorkspace(dir)
      .then((ws) => {
        go(ws);
        notifications.show({ title: "Workspace changed", message: ws, color: "teal", autoClose: 4000 });
      })
      .catch((e) => notifications.show({ title: "Could not set workspace", message: (e as Error).message, color: "red" }));
  };

  const create = async () => {
    if (!nameOk || busy || !cur || clash) return;
    setBusy(true); setError(null);
    try {
      const { dir, caseFiles } = await createCase(cur.dir, name, statement);
      loadLocalCase(dir, caseFiles);
      notifications.show({
        title: `Case "${name}" created`,
        message: "Empty, in curation.  Open the 🤖 Assistant to fill the dicts, or edit them in your editor.",
        color: "teal", autoClose: 5000,
      });
      close();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={close} centered size="lg" title={
      <Group gap={6}><IconFilePlus size={17} /><Text fw={600}>New case</Text></Group>
    }>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          Creates an <strong>empty</strong> case (curation phase) in the folder shown
          below.  Browse to where you want it; only the structure is scaffolded —
          you author the physics yourself or via the console.
        </Text>

        <Breadcrumb cur={cur} go={go} onSetWorkspace={changeWorkspace} />

        {navError && (
          <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
            <Text size="xs">{navError}</Text>
            <Text size="xs" c="dimmed" mt={4}>
              The bridge serves the workspace.  Without it, create from a terminal:
              <code> newCase &lt;name&gt;</code>.
            </Text>
          </Alert>
        )}
        {loading && !cur && (
          <Group gap={8} py="sm" justify="center"><Loader size="sm" /><Text size="sm" c="dimmed">listing…</Text></Group>
        )}

        {cur && <FolderRows cur={cur} go={go} mode="new" />}

        <TextInput
          label="Case name" placeholder="e.g. flash_etoh_water" data-autofocus
          value={name} onChange={(e) => setName(e.currentTarget.value)}
          error={nameError ?? (clash ? `"${name}" already exists in this folder.` : null)}
          onKeyDown={(e) => { if (e.key === "Enter" && nameOk && !clash) create(); }}
        />
        <Textarea
          label="Problem statement (optional)"
          description="Seeds the case CLAUDE.md + controlDict so the assistant knows the goal."
          placeholder='e.g. "10 g/L glucose, 10 bar, NF270 -- observed rejection?"'
          autosize minRows={2} maxRows={5}
          value={statement} onChange={(e) => setStatement(e.currentTarget.value)}
        />

        {error && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
            <Text size="xs">{error}</Text>
          </Alert>
        )}

        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
            {cur && nameOk ? `→ ${cur.dir}/${name}` : "choose a folder + name"}
          </Text>
          <Group gap="xs">
            <Button variant="default" size="xs" onClick={close} disabled={busy}>Cancel</Button>
            <Button size="xs" color="accent" loading={busy}
              disabled={!nameOk || !cur || clash} onClick={create}>Create &amp; open</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
