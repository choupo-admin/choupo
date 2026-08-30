#!/usr/bin/env node
// =============================================================================
//        \|/       C hemicals     | Open-source, glass-box chemical process simulator
//       \\|//      H eat-transfer | https://choupo.org
//      \\\|///     O perations    |
//       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
//        \|/       P roperties    | Licence: GPL-3.0-or-later
//         |        O ptimization  |
//        /|\                      |
// -------------------------------------------------------------------------------
// License
//     This file is part of Choupo.
//
//     Choupo is free software: you can redistribute it and/or modify it
//     under the terms of the GNU General Public License as published
//     by the Free Software Foundation, either version 3 of the License, or
//     (at your option) any later version.
//
//     Choupo is distributed in the hope that it will be useful, but WITHOUT
//     ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
//     FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
//     License for more details (https://www.gnu.org/licenses/gpl-3.0.html).
//
//     SPDX-License-Identifier: GPL-3.0-or-later
//
//     Credit and attribution: see AUTHORS
//     Required legal notices:  see NOTICE
// =============================================================================

//---------------------------------------------------------------------------//
//  method_tools -- DERIVE `generated/methodTools.json` from the EduTools
//                  registry, so the landing page can advertise the tools
//                  without a second hand-written list of them.
//
//      bin/curate/method_tools.mjs           write generated/methodTools.json
//      bin/curate/method_tools.mjs --emit    print the derived document, no write
//
//  WHY IT EXISTS.  `METHOD_TOOLS` in gui/src/ui/methods/registry.ts is the ONE
//  home of which classical-method tools exist, what they are called, what each
//  teaches and whether it is live.  The landing page (site/index.html) now
//  offers them as a front door -- decided in
//  docs/design/modes-and-views-in-the-top-row.md 4a, whose first condition is
//  "generated from METHOD_TOOLS, never a hand-written list", with the failure
//  mode named: the day a thirteenth tool is added it appears in the app and not
//  on the landing, or the reverse, and nothing says so.
//
//  THE MECHANISM, AND WHY THIS ONE.  Two routes were possible and both were
//  MEASURED before choosing:
//
//    1. PARSE the array literal with the TypeScript compiler's AST.  Cheap and
//       dependency-light, but it can only read LITERALS: the day an entry is
//       built by a helper, a spread or a conditional, a parser either misses it
//       silently or has to refuse.  Its blind spot would have to be written
//       down and believed.
//
//    2. TRANSPILE the module and IMPORT it, so what this script sees is the
//       exact array the application sees -- computed entries included.  The
//       risk was that registry.ts drags React and lazy Plotly imports into a
//       plain node process.  MEASURED 2026-08-17: it does not.  The registry
//       lives in its own module precisely so the menu bar can read it without
//       the plotting bundle (its own header says so), it imports only
//       `useSyncExternalStore` from react and `guideUrl` from help/guideLinks,
//       and neither is touched at module scope.  The probe imported it in
//       node v22 and reported 12 tools, 12 live.
//
//  Route 2 is therefore taken: no parser, no blind spot to declare, and if the
//  registry ever does grow an import that cannot run outside a browser the
//  failure is a thrown module error at generation time -- loud, not a short
//  list.
//
//  THE DEPENDENCY WALK is the one regex here, and it is not a data parse: it
//  finds relative import specifiers so their sources get transpiled too.  If it
//  ever misses one, the subsequent `import()` throws ERR_MODULE_NOT_FOUND.  A
//  miss cannot become a quiet under-report.
//
//  EXIT CODES.  0 wrote/emitted; 1 the registry could be read but says
//  something impossible (no live tools); 2 CANNOT RUN (no node_modules, no
//  TypeScript).  2 is not a pass: the caller must treat it as "unchecked".
//---------------------------------------------------------------------------//

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const GUI = path.join(ROOT, "gui");
const REGISTRY = path.join(GUI, "src", "ui", "methods", "registry.ts");
const TSLIB = path.join(GUI, "node_modules", "typescript", "lib", "typescript.js");
const OUT = path.join(ROOT, "generated", "methodTools.json");

//  The transpiled copies live INSIDE gui/node_modules so that bare specifiers
//  ("react") still resolve by the ordinary upward walk, and so that nothing
//  this script writes can ever land in a commit -- node_modules is gitignored.
const WORK = path.join(GUI, "node_modules", ".cache", "choupo-methodTools");

/** The deep link is the app's existing contract (registry.ts: `?workspace=
 *  methods&tool=<id>`), and the landing must not build a second one.  It is
 *  spelled HERE, once, and travels to the page inside the artefact. */
const hrefFor = (id) => `/app/?workspace=methods&tool=${id}`;

function cannotRun(msg)
{
    console.error(`method_tools: CANNOT RUN -- ${msg}`);
    process.exit(2);
}

function transpileClosure(ts)
{
    fs.rmSync(WORK, { recursive: true, force: true });

    const queue = [REGISTRY];
    const seen = new Set();
    while (queue.length)
    {
        const file = queue.pop();
        if (seen.has(file)) continue;
        seen.add(file);

        const src = fs.readFileSync(file, "utf8");
        const js = ts.transpileModule(src, {
            compilerOptions: {
                module: ts.ModuleKind.ESNext,
                target: ts.ScriptTarget.ES2022,
            },
        }).outputText;

        const rel = path.relative(GUI, file).replace(/\.tsx?$/, ".js");
        const dest = path.join(WORK, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, js);

        for (const m of src.matchAll(/from\s+["'](\.[^"']+)["']/g))
        {
            const bare = m[1].replace(/\.jsx?$/, "");
            for (const ext of [".ts", ".tsx"])
            {
                const cand = path.resolve(path.dirname(file), bare + ext);
                if (fs.existsSync(cand)) { queue.push(cand); break; }
            }
        }
    }

    return path.join(WORK, "src", "ui", "methods", "registry.js");
}

async function main()
{
    if (!fs.existsSync(REGISTRY))
        cannotRun(`${path.relative(ROOT, REGISTRY)} is not in this tree`);
    if (!fs.existsSync(TSLIB))
        cannotRun("gui/node_modules/typescript is absent -- run `npm install` in gui/");

    const ts = (await import(url.pathToFileURL(TSLIB).href)).default;
    const entry = transpileClosure(ts);
    const mod = await import(url.pathToFileURL(entry).href);
    fs.rmSync(WORK, { recursive: true, force: true });

    const all = mod.METHOD_TOOLS;
    if (!Array.isArray(all) || all.length === 0)
    {
        console.error("method_tools: FAILED -- METHOD_TOOLS is empty or not an "
            + "array; the registry was read but says nothing.");
        return 1;
    }

    //  ONLY `live`.  A planned tool is VISIBLE in the app's own menu, where it
    //  renders disabled and states that it is a roadmap entry; a landing page
    //  has no such frame, and a link a visitor cannot use is an advertisement.
    const tools = all
        .filter((t) => t.status === "live")
        .map((t) => ({
            id: t.id,
            label: t.label,
            discipline: t.discipline,
            teaches: t.teaches,
            href: hrefFor(t.id),
        }));

    if (tools.length === 0)
    {
        console.error(`method_tools: FAILED -- ${all.length} tool(s) in the `
            + "registry and NONE with status 'live'.  Refusing to publish an "
            + "empty EduTools section: an empty list and a broken read look "
            + "identical on the page.");
        return 1;
    }

    const doc = {
        note: "DERIVED by transpiling and importing gui/src/ui/methods/"
            + "registry.ts -- the array this file lists is the array the "
            + "application itself renders.  DO NOT EDIT BY HAND: regenerate "
            + "with bin/curate/method_tools.mjs.  Only `live` tools appear.",
        generatedFrom: "gui/src/ui/methods/registry.ts",
        label: mod.EDUTOOLS_LABEL,
        blurb: mod.EDUTOOLS_BLURB,
        //  Shelf order is the registry's, carried verbatim -- the landing
        //  groups by it and must not invent its own (owner, 2026-08-30).
        disciplines: mod.METHOD_DISCIPLINES,
        liveTools: tools.length,
        registryTools: all.length,
        tools,
    };

    const text = JSON.stringify(doc, null, 2) + "\n";

    if (process.argv.includes("--emit"))
    {
        process.stdout.write(text);
        return 0;
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, text);
    console.log(`method_tools: wrote ${path.relative(ROOT, OUT)} -- `
        + `${tools.length} live tool(s) of ${all.length} in the registry`);
    return 0;
}

main().then((c) => process.exit(c), (e) => {
    console.error("method_tools: FAILED -- could not evaluate the registry:");
    console.error(e && e.stack ? e.stack : String(e));
    process.exit(1);
});
