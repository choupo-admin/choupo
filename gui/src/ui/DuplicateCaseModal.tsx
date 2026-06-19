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
  DuplicateCaseModal -- "Duplicate case as...".  Copies the OPEN local case to a
  sibling folder under a new name (a design VARIANT) and opens it.  Source only
  is copied (dicts + CLAUDE.md + constant data), never generated output; the
  variant is a real folder on disk you can diff, run, and switch between.
\*---------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import { Alert, Button, Group, Modal, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { IconCopy, IconAlertTriangle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

import { useStore } from "../state/store.js";
import { duplicateCase, CASE_NAME_RE } from "../cases/workspace.js";
import { localCaseDir, caseDisplayName } from "../case/caseName.js";

export function DuplicateCaseModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const tutorialName = useStore((s) => s.tutorialName);
  const loadLocalCase = useStore((s) => s.loadLocalCase);
  const srcDir = localCaseDir(tutorialName);
  const srcName = caseDisplayName(tutorialName);

  const [name, setName] = useState("");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill a sensible variant name when the dialog opens.
  useEffect(() => {
    if (opened) { setName(`${srcName}_v2`); setStatement(""); setError(null); setBusy(false); }
  }, [opened, srcName]);

  const nameOk = CASE_NAME_RE.test(name);
  const nameError = name.length > 0 && !nameOk
    ? "Letters, digits, '-' and '_' only (no spaces, no '/')." : null;

  const run = async () => {
    if (!nameOk || busy || !srcDir) return;
    setBusy(true); setError(null);
    try {
      const { dir, caseFiles } = await duplicateCase(srcDir, name, statement);
      loadLocalCase(dir, caseFiles);
      notifications.show({
        title: `Variant "${name}" created`,
        message: `Copied from ${srcName}.  Switch between them from the case name in the top bar.`,
        color: "teal", autoClose: 5000,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered size="md" title={
      <Group gap={6}><IconCopy size={17} /><Text fw={600}>Duplicate case as…</Text></Group>
    }>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          Copies <code>{srcName}</code> to a sibling folder under a new name — a design
          variant you can change independently and switch back and forth.
        </Text>
        <TextInput
          label="Variant name" data-autofocus
          value={name} onChange={(e) => setName(e.currentTarget.value)}
          error={nameError}
          onKeyDown={(e) => { if (e.key === "Enter" && nameOk) run(); }}
        />
        <Textarea
          label="What's different (optional)"
          description="Rewrites the variant's controlDict description so you can tell them apart."
          placeholder='e.g. "with condenser→feed heat integration"'
          autosize minRows={2} maxRows={4}
          value={statement} onChange={(e) => setStatement(e.currentTarget.value)}
        />
        {error && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
            <Text size="xs">{error}</Text>
          </Alert>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" size="xs" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="xs" color="accent" loading={busy} disabled={!nameOk} onClick={run}>
            Duplicate &amp; open
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
