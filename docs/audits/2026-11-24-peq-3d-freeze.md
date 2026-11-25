# Why the PEQ plant's 3D layout page freezes in headless Chromium (2026-11-24)

Date 2026-11-24, measurement only: no source, case, gate or site file was edited.  Author: a general, for the architect.  Trees: `afd3f8ff9` (the first browser pass) and `d51d651da` (the second), each built with its own `npm run build` and served by `vite preview`, both running the SAME engine, the WASM the site serves today (`wasm/version.json` commit `d51d651da`, downloaded from the site).  No saved copy of the `afd3f8ff9` WASM exists on this machine, so the engine half of the A/B (GUI-afd with WASM-afd) was NOT done.  The 3D scene is computed from the engine's layout result, so a changed engine could in principle change the scene; its size is the same on both GUIs (33 items, 34 pipes, 13 utility lines) and the triangle counts below agree between them within load noise.

## Verdict

**Environment, not a GUI regression.**  Both GUIs freeze the page on the PEQ plant's 3D view on this machine, for minutes, and both do eventually open it.  The machine has no GPU (no `/dev/dri`), so Chromium draws WebGL with SwiftShader, a software rasteriser on four 2.1 GHz Xeon cores, which were also loaded by other work (load average 8 to 13 during the runs).  The page's JavaScript is not what takes the time: it is the main thread waiting for the software rasteriser to draw the plant, about 450 000 triangles per frame.  No commit between the two trees is implicated; none of the 32 commits touches `PlantLayout3D.tsx`, `layoutRenderer.ts`, `plantLayout.ts` or `gui/src/export` (the only file the diff changes under `gui/src/ui/plotting` is `TrajectoryPlot.tsx`, a trajectory plot; the `gui/` diff is 26 files: case-name resolver, store, tutorials list, tear lessons, schemas).

What this does and does not say about the 2 December machine: it says the freeze needs a rasteriser that is slow for this scene, not a code defect that real hardware would share.  It does not say a real laptop is fast enough: that is Vítor's measurement.

## Setup

CPU: `Intel(R) Xeon(R) Processor @ 2.10GHz`, 4 cores, 15 GB.  GL renderer string (`UNMASKED_RENDERER_WEBGL`): `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.  Playwright headless Chromium, viewport 1440x900, scale 1, one fresh browser per attempt, no flags unless stated.  Case opened as `?case=plant/<name>`, "Run flowsheet", wait for "Run complete", Reports tab, click "Plant layout (3D)"; the clock runs from the click until the page first answers a trivial `evaluate` and has a canvas (it has none while blocked).  Cap 10 to 12 minutes, never reached.  Two browsers at once at most, because two other generals were building on the machine; the pairs below ran side by side so each pair sees the same load.

## 1. The A/B: PEQ, three attempts per GUI (default quality "high")

| attempt | GUI afd3f8ff9: run [s] | afd: click to answer [s] | GUI d51d651da: run [s] | d51: click to answer [s] | pair's load (1 min) |
|---|---|---|---|---|---|
| 1 | 44.3 | 270 | 42.9 | 389 (profiler on) | 8 |
| 2 | 45.3 | 621 | 48.2 | 507 | 11 to 13 |
| 3 | 41.5 | 425 | 41.5 | 558 | 11 to 13 |

The two GUIs are inside each other's spread (270 to 621 s against 389 to 558 s), and the spread follows the machine's load, not the commit.  The run itself, timed alone before the 3D view is touched, is 41 to 48 s on both and the page stays responsive during it (the page's own 100 ms ticker never lags more than 160 ms).  So on this machine the run is not what stalls; the 3D open is.

Evidence that it is one blocked main thread and not slow JavaScript: a ticker inside the page logged every 5 s.  Before the click it ticks normally; after the click about 270 frames and 100 000 draw calls are issued in the first 5 s (the render loop runs at display rate and the calls queue), and then the thread stops ticking for the whole wait (largest gap 228 s, 421 s, 504 s in three captures); when the queue drains, frames continue at about one per 2 s.

## 2. The profile (CDP `Profiler`, d51 attempt 1, 392 s)

| share of samples | function |
|---|---|
| 99.9 % (391.7 s) | `(program)`, native code outside JavaScript |
| 0.03 % | `(idle)` |
| 0.04 % | three.js: `renderBufferDirect`, `bindVertexArray`, `uniformMatrix4fv`, `drawElements` (a few ms each) |

Nothing is computed in JavaScript: no routing, meshing or geometry building shows up (the largest JavaScript entry is 15 ms).  The time is DRAWING: the browser's GL command buffer is full, and the main thread waits in the GL client for the GPU process, which is SwiftShader.  Chromium's own message `GPU stall due to ReadPixels` is printed once the page recovers.

## 3. What the scene costs per frame

Counted by wrapping `drawElements`, `drawArrays` and `drawElementsInstanced` before the page loads (so the count includes everything three.js issues):

| case, quality | triangles per frame | draw calls per frame |
|---|---|---|
| line01, high | about 6 500 | about 10 |
| ammonia02, high | about 51 000 | about 190 |
| PEQ, fast | about 300 000 | about 400 |
| PEQ, high | 450 000 to 520 000 | 600 to 700 |

In PEQ's fast frame, one mesh of 63 852 indices (21 284 triangles) is drawn ten times per frame, 45 % of all triangles: it is the ten identical hydrogen buffer vessels (V-004A-J), each its own mesh and draw call, not instanced.  The next entries are two meshes of 62 526 indices (8.8 %) and one of 99 156 (7.0 %); about 290 small calls per frame are pipes and labels (72 indices each).  The high quality adds the ambient-occlusion and shadow passes (a further 50 % of triangles and 250 calls).  Items and pipes alone do not predict the cost: ammonia02 has 29 items and 33 pipes, PEQ has 33 and 34, and PEQ draws nine times as many triangles.

## 4. Scaling (GUI d51d651da, default quality)

| case | items | pipes | triangles/frame | 3D click to answer, three attempts [s] |
|---|---|---|---|---|
| line01_pumped_drum | 2 | 4 | 6 500 | 5.7, 3.4, 3.7 (alone 2.8) |
| ammonia02_full_plant | 29 | 33 | 51 000 | 5.1, 5.0, 5.0 |
| ammoniaPEQ_baseCase | 33 | 34 (+13 utility lines) | 450 000 to 520 000 | 389, 507, 558 |

Time is not proportional to items: between ammonia02 and PEQ the item count grows 14 % and the time 80 to 110 times.  It follows the triangle count through a cliff: a 9-fold rise in triangles per frame moves the first answer from 5 s to minutes, because the render loop queues frames faster than the software rasteriser can draw them.

## 5. Other GL paths

Backends reachable here: only SwiftShader (via ANGLE's Vulkan backend).  Every flag set below reports the same SwiftShader renderer or an unreadable string (the probe timed out on two of them); no hardware device exists to select.

| flags | line01 (open, s) | PEQ, click to answer |
|---|---|---|
| none | 2.8 to 5.7 | 270 to 621 s |
| `--use-gl=angle --use-angle=swiftshader` | 6.2 | not run on PEQ (the same renderer as none) |
| `--enable-unsafe-swiftshader` | 5.0 | 565 s |
| `--use-gl=egl` | 3.3 | 451 s |
| `--use-angle=vulkan`, `--use-angle=gl` | 3.7 | not run (same SwiftShader string) |

No different software path helps; all stay inside the same spread.  Reducing the drawing cost does help: with the app's own "fast" quality (set through its `choupo.layout3d.quality` storage key, exactly what the Quality control writes) PEQ answered in 227 s, alone on the machine, against 270 s for the same GUI with another browser beside it; fast removes the AO and shadow passes but not the 300 000 triangles, so it is still a freeze here.

## What was not done

- GUI-afd with WASM-afd: no saved `afd3f8ff9` WASM and no emscripten here; the engine half of the A/B is open.  The d51 WASM served both GUIs.
- No real GPU: a machine with one is the test that matters for the demonstration, and it is not covered by these numbers.
- The 3D open was not measured on an unloaded machine (other builds ran throughout; the load is stated per pair).
- The triangle breakdown is read from draw-call sizes, not from the three.js scene graph (the scene is not reachable from the page); the attribution of the 21 284-triangle mesh to the ten buffer vessels is inferred from the count (ten per frame) and is not confirmed by name.
- The laptop's "Run failed after about 200 s under load" was not reproduced: here the PEQ run completes in 41 to 48 s on all attempts and during the 3D open the run is already finished.
- The "Economic appraisal" freeze of the second pass was not tested.

## Where the scripts and screenshots are

`/tmp/claude-0/gen-3d/` (`t3d.js`, the per-attempt result files `r-*.txt`, the ticker logs `tick-*.log`, the CPU profile `prof-d51-1.json`, the draw-call histogram `hist-peq-hist.json`).
