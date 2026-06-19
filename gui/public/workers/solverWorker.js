/*---------------------------------------------------------------------------*\
  Choupo -- Web Worker host for the WebAssembly solvers (v0.25+).

  The worker hosts FOUR possible WASM modules, one per binary:

      choupoSolve   (steady-state)
      choupoBatch   (batch + recipes)
      choupoCtrl    (dynamic + control)
      choupoProps   (properties + LM fitting,   v0.38+)

  The host (WasmAdapter) reads each case's `application` field from
  controlDict and sends it in the run message; the worker fetches the
  matching glue + .wasm and invokes `run_case` on the chosen factory.

  Loading strategy (unchanged from v0.24)
  ----------------
  Vite intercepts dynamic imports of public/ files in subtle ways even
  inside workers, and the apt-installed Emscripten emits UMD glue (no
  `export default`).  To stay independent of the bundler:

    1. fetch the glue as TEXT
    2. append `export default <factoryName>;` to upgrade UMD into a
       real ES module (factoryName matches the binary's EXPORT_NAME)
    3. import the resulting text as a Blob URL
    4. override `locateFile` so the .wasm sidecar is fetched from the
       real /wasm/<binary>.wasm, not from the blob URL

  Message protocol
    main -> worker:  {
                       type: "run",
                       binary: "choupoSolve" | "choupoBatch" | "choupoCtrl"
                              | "choupoProps",
                       files:  { "system/controlDict": "...", ... },
                     }
    worker -> main:  { type: "log",        line: string }
    worker -> main:  { type: "trajectory", csv:  string }              (legacy)
    worker -> main:  { type: "csvFiles",   files: { [relPath]: string } }
    worker -> main:  { type: "done",       rc:    number }
    worker -> main:  { type: "error",      message: string }
\*---------------------------------------------------------------------------*/

const BINARIES = {
  choupoSolve: { factory: "createChoupoSolve" },
  choupoBatch: { factory: "createChoupoBatch" },
  choupoCtrl:  { factory: "createChoupoCtrl"  },
  choupoProps: { factory: "createChoupoProps" },
};

// Cache loaded factories by binary name --- a worker that runs the
// same case twice in a row should not re-fetch the .wasm.
const factoryCache = {};

async function loadFactory(binary) {
  if (factoryCache[binary]) return factoryCache[binary];
  const spec = BINARIES[binary];
  if (!spec) {
    throw new Error(
      `Unknown WASM binary '${binary}'.  Expected one of: ` +
        Object.keys(BINARIES).join(", "),
    );
  }
  const glueUrl = `/wasm/${binary}.js`;

  factoryCache[binary] = (async () => {
    const cb = `?t=${Date.now()}`;
    const res = await fetch(glueUrl + cb, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${glueUrl}`);
    const text =
      (await res.text()) + `\nexport default ${spec.factory};\n`;
    const blob = new Blob([text], { type: "application/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    try {
      const mod = await import(blobUrl);
      const factory = mod.default;
      if (typeof factory !== "function") {
        throw new Error(
          `glue default export for ${binary} is ${typeof factory} ` +
            `(expected function); keys: ${Object.keys(mod).join(", ") || "<none>"}`,
        );
      }
      return factory;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  })().catch((e) => {
    delete factoryCache[binary];
    throw e;
  });
  return factoryCache[binary];
}

self.postMessage({ type: "log", line: "[worker] booted, awaiting run message" });

self.addEventListener("message", async (e) => {
  const msg = e.data;
  if (!msg || msg.type !== "run") return;

  let settled = false;
  const settle = (out) => {
    if (settled) return;
    settled = true;
    self.postMessage(out);
  };

  const binary = msg.binary || "choupoSolve";
  const wasmUrl = `/wasm/${binary}.wasm`;

  self.postMessage({
    type: "log",
    line: `[worker] received run for binary=${binary}; files: ` +
      Object.keys(msg.files || {}).join(", "),
  });

  try {
    self.postMessage({ type: "log", line: `[worker] fetching WASM glue (${binary})...` });
    const factory = await loadFactory(binary);
    self.postMessage({ type: "log", line: "[worker] glue loaded; invoking factory..." });

    const log = (s) => self.postMessage({ type: "log", line: s });
    factory({
      arguments: ["/case"],
      locateFile: (path) =>
        path.endsWith(".wasm") ? `${wasmUrl}?t=${Date.now()}` : path,

      preRun: [
        function (Module) {
          log("[worker] preRun: writing dicts to MEMFS");
          const FS = Module.FS;
          // mkdir-p: create each segment of a path if missing.
          const ensureDir = (absDir) => {
            const parts = absDir.split("/").filter(Boolean);
            let cur = "";
            for (const p of parts) {
              cur += "/" + p;
              if (!FS.analyzePath(cur).exists) FS.mkdir(cur);
            }
          };
          try {
            for (const d of ["/case", "/case/system", "/case/constant"]) {
              if (!FS.analyzePath(d).exists) FS.mkdir(d);
            }
            for (const [relPath, body] of Object.entries(msg.files)) {
              // Some cases ship nested artefacts (constant/components/
              // <name>.dat, etc.).  mkdir-p the parent dir before
              // writing so MEMFS does not fail on missing intermediate
              // directories.
              const lastSlash = relPath.lastIndexOf("/");
              if (lastSlash > 0) {
                ensureDir("/case/" + relPath.substring(0, lastSlash));
              }
              FS.writeFile("/case/" + relPath, body);
            }
            log("[worker] preRun: MEMFS prepared (" + Object.keys(msg.files).length + " files)");
          } catch (err) {
            log("[worker] preRun FAILED: " + (err && err.message ? err.message : String(err)));
          }
        },
      ],

      print: (line) => self.postMessage({ type: "log", line }),
      printErr: (line) =>
        self.postMessage({ type: "log", line: "[stderr] " + line }),

      onRuntimeInitialized: () => log("[worker] WASM runtime initialised"),
      onExit: (status) => {
        log("[worker] onExit fired, status=" + status);
        settle({ type: "done", rc: status });
      },
      onAbort: (reason) => {
        log("[worker] onAbort fired: " + reason);
        settle({ type: "error", message: `aborted: ${reason}` });
      },
    }).then(
      (Module) => {
        log("[worker] factory resolved; invoking run_case('/case')");
        if (typeof Module.ccall !== "function") {
          settle({
            type: "error",
            message: "Module.ccall not exported; rebuild WASM",
          });
          return;
        }
        try {
          const rc = Module.ccall("run_case", "number", ["string"], ["/case"]);
          log("[worker] run_case returned rc=" + rc);

          // Collect every CSV the case produced under /case.  Used by:
          //   * choupoBatch / choupoCtrl  ->  trajectory.csv
          //   * choupoProps                 ->  property scan / fit CSVs
          //                                      (filenames user-defined)
          // Steady cases typically produce nothing; absence is silent.
          if (rc === 0) {
            try {
              const csvFiles = {};
              const proposals = {};   // *.estimate-*.dat written by estimateComponent
              const walk = (dir) => {
                const entries = Module.FS.readdir(dir);
                for (const name of entries) {
                  if (name === "." || name === "..") continue;
                  const path = dir + "/" + name;
                  let st;
                  try { st = Module.FS.stat(path); } catch (_) { continue; }
                  if (Module.FS.isDir(st.mode)) {
                    walk(path);
                  } else if (name.endsWith(".csv") || /\.estimate-.*\.dat$/.test(name)) {
                    try {
                      const body = Module.FS.readFile(path, { encoding: "utf8" });
                      const rel = path.startsWith("/case/")
                        ? path.substring("/case/".length)
                        : path;
                      if (name.endsWith(".csv")) csvFiles[rel] = body;
                      else proposals[rel] = body;
                    } catch (_) {
                      /* ignore individual file failures */
                    }
                  }
                }
              };
              walk("/case");

              // Component proposal .dat files (estimateComponent promote) --
              // carried back so the GUI can preview + offer a download.  The
              // GUI never writes; this is a read-only harvest of a run output.
              if (Object.keys(proposals).length > 0) {
                log("[worker] collected " + Object.keys(proposals).length
                    + " proposal .dat file(s): " + Object.keys(proposals).join(", "));
                self.postMessage({ type: "proposals", files: proposals });
              }

              // Legacy single-trajectory channel (kept for the Plots tab
              // that already wires off `trajectory` messages).
              if (csvFiles["trajectory.csv"]) {
                const csv = csvFiles["trajectory.csv"];
                log("[worker] read trajectory.csv (" + csv.length + " bytes)");
                self.postMessage({ type: "trajectory", csv });
              }

              if (Object.keys(csvFiles).length > 0) {
                log("[worker] collected " + Object.keys(csvFiles).length
                    + " CSV file(s): " + Object.keys(csvFiles).join(", "));
                self.postMessage({ type: "csvFiles", files: csvFiles });
              }
            } catch (e) {
              log("[worker] CSV collection failed: "
                  + (e && e.message ? e.message : String(e)));
            }
          }

          settle({ type: "done", rc });
        } catch (err) {
          const message = err && err.message ? err.message : String(err);
          log("[worker] run_case threw: " + message);
          settle({ type: "error", message });
        }
      },
      (err) => {
        const message = err && err.message ? err.message : String(err);
        log("[worker] factory promise REJECTED: " + message);
        settle({ type: "error", message });
      },
    );
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    settle({ type: "error", message });
  }
});
