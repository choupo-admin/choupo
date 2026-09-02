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
  server.mjs -- ONE home for "is a dev server up, and if not, start one".

  These four functions and the Refusal class lived inside checkGui.mjs.  A
  second browser-driving tool (drive-app, 2026-09-02) needed exactly them, and
  a copy would have been two homes for one behaviour -- the arity sin inside
  the tooling built to catch it.  Moved verbatim; checkGui.mjs imports them.

  The Refusal class is here too because "could not honestly run" is a verdict
  every browser tool must be able to return: this project retired a gate
  that reported PASS while its inputs were gone.
\*---------------------------------------------------------------------------*/
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

export const HOST = "127.0.0.1";
export const PORT = 5173;

export class Refusal extends Error {
  constructor(what, remedy) {
    super(what);
    this.remedy = remedy;
  }
}

export function portOpen(host, port, timeoutMs = 600) {
  return new Promise((res) => {
    const s = net.connect({ host, port });
    const done = (v) => { s.destroy(); res(v); };
    s.setTimeout(timeoutMs);
    s.once("connect", () => done(true));
    s.once("timeout", () => done(false));
    s.once("error", () => done(false));
  });
}

export async function waitForServer(timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await portOpen(HOST, PORT)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** Reuse a listening server; otherwise start bin/devGui and own it. */
export async function ensureServer(log) {
  if (await portOpen(HOST, PORT)) {
    log(`[server] reusing what is already listening on ${HOST}:${PORT}`);
    return { started: null };
  }
  const devGui = join(ROOT, "bin/devGui");
  if (!existsSync(devGui)) {
    throw new Refusal(`no dev-server launcher at ${devGui}`, "start Vite yourself (cd gui && npm run dev) and re-run.");
  }
  log(`[server] nothing on ${HOST}:${PORT} -- starting bin/devGui (this one is ours to clean up)`);
  const proc = spawn(devGui, [], {
    cwd: ROOT,
    detached: true,             // own process group, so we can reap the whole tree
    stdio: ["ignore", "pipe", "pipe"],
  });
  let tail = "";
  const keep = (c) => { tail = (tail + c.toString()).slice(-2000); };
  proc.stdout.on("data", keep);
  proc.stderr.on("data", keep);

  if (!(await waitForServer(120000))) {
    stopServer(proc);
    throw new Refusal(
      `bin/devGui did not open ${HOST}:${PORT} within 120 s.  Last output:\n${tail}`,
      "run bin/devGui by hand and read the error; a missing gui/node_modules or a busy port is the usual cause.",
    );
  }
  log("[server] up");
  return { started: proc, tail: () => tail };
}

export function stopServer(proc) {
  if (!proc) return;
  try { process.kill(-proc.pid, "SIGTERM"); } catch { /* already gone */ }
  try { process.kill(-proc.pid, "SIGKILL"); } catch { /* already gone */ }
}

