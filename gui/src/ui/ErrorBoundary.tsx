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
  ErrorBoundary
  =============

  React's error boundary catches render-time exceptions and replaces the
  failed subtree with a fallback UI, instead of letting the exception
  propagate to the root and unmount the whole app (the "black screen"
  failure mode).

  Used at the top level of AppShell to keep a single bad component from
  killing the rest of the GUI.  The fallback shows the error message +
  stack so the user can copy/paste it when reporting a bug.
\*---------------------------------------------------------------------------*/

import { Alert, Button, Code, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional human-friendly name of the surrounding scope, shown in
   *  the fallback ("Component <name> crashed"). */
  scope?: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ error, info });
    // Surface to the console too, for F12 inspection.

    console.error("ErrorBoundary caught:", error, info);
  }

  reset = (): void => {
    this.setState({ error: null, info: null });
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const stack = this.state.error.stack ?? this.state.error.message;
    const componentStack = this.state.info?.componentStack ?? "(no component stack)";
    return (
      <Stack p="md" gap="sm" style={{ height: "100%", overflow: "auto" }}>
        <Alert color="red" icon={<IconAlertTriangle size={16} />}
          title={`Render error${this.props.scope ? ` in ${this.props.scope}` : ""}`}>
          <Text size="sm">
            A component threw an exception while rendering.  The rest of
            the app is still alive — click <b>Reset</b> below, or reload
            the page (Ctrl+Shift+R).  Please report this with the trace
            below.
          </Text>
        </Alert>
        <Code block style={{ fontSize: 11, maxHeight: 240, overflow: "auto" }}>
          {stack}
        </Code>
        <Text size="xs" c="dimmed">Component stack:</Text>
        <Code block style={{ fontSize: 11, maxHeight: 160, overflow: "auto" }}>
          {componentStack}
        </Code>
        <Button onClick={this.reset} color="cyan" variant="light" size="xs"
          style={{ alignSelf: "flex-start" }}>
          Reset
        </Button>
      </Stack>
    );
  }
}
