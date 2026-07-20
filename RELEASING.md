# Releasing Choupo

Two branches, immutable tags, one naming convention (settled 2026-07-20):

```
main   latest stable release            (e.g. Choupo-2607)
dev    active development, Choupo-dev   (toward the next Choupo-YYMM)

Public name:      Choupo-2607
Internal version: 2607        (CITATION.cff, Banner)
Git tag:          v2607       (immutable: never deleted, moved or reused)
GitHub Release:   tag v2607, title "Choupo-2607"
```

Never use variants (`v26.07`, `2026.07`, `Choupo-v2607`).  Releases come
roughly every six months (2607, 2701, 2707, …).  No per-version branches
unless an old release someday needs long-term maintenance.

## Where work goes

- New features: `dev`.
- Critical fixes to the stable release: `main`, then also applied to `dev`.
- The published tag is never touched by fixes; `main` may advance past it.

## Publishing a release (from dev)

1. Update the internal version: `src/core/Banner.H` (`CHOUPO_VERSION
   "Choupo-YYMM"`, drop the dev suffix), `CITATION.cff` (`version`,
   `date-released`, preferred-citation tag URL).
2. Update `README.md` and the `CHANGELOG.md` section for the release.
3. Update the landing page (release name, date, citation block).
4. Run everything: `bin/runTests` (0 FAIL), `cd gui && npx tsc --noEmit &&
   npx vitest run`, `make wasm-gui`.
5. Merge and tag:

   ```bash
   git checkout main
   git merge --no-ff dev
   git push origin main
   git tag -a vYYMM -m "Choupo-YYMM"
   git push origin vYYMM
   ```

6. Create the GitHub Release: tag `vYYMM`, title `Choupo-YYMM`, notes from
   the CHANGELOG section (`gh release create vYYMM --title "Choupo-YYMM"
   --notes-file <notes>`).
7. Freeze the release's app at `/vYYMM/app/` and deploy the site (both in
   "Site deployment" below); add the release to the /releases/ history
   list and point its "Run" button at the frozen copy.
8. On `dev`: bump the Banner to `Choupo-dev` with the next target release,
   and open the next CHANGELOG section.

## Identification in the binaries

- Stable (`main` / a tag): `Version: Choupo-YYMM`.
- Development (`dev`): `Version: Choupo-dev · target Choupo-YYMM ·
  commit <short hash>` — the hash matters precisely because dev moves.

## Day-to-day workflow (pushing work)

All development happens on `dev`:

```bash
git checkout dev
# ... work, commit (identity: Vítor Geraldes <talentgroundlda@gmail.com>) ...
bin/runTests            # 0 FAIL before any push
git push origin dev
```

A **critical fix to the stable release** goes to `main` first, then into
`dev` — never the other way around:

```bash
git checkout main && git cherry-pick <fix>   # or commit directly
bin/runTests && git push origin main
git checkout dev && git merge main && git push origin dev
```

Published `vYYMM` tags are never deleted, moved or reused — no exceptions.

## Site deployment (choupo.org)

**`/app/` serves Choupo-dev by default** — a browser app has no install,
so visitors run the newest line, badged `Choupo-dev · <commit>` in the top
bar (the badge reads `wasm/version.json`, written by the WASM build beside
the binaries).  **Each stable release keeps a frozen copy at
`/vYYMM/app/`** — the citable, teachable, never-touched URL.

Deploying the dev line (the routine deploy; ONLY with a green suite):

```bash
git checkout dev
bin/runTests                                  # 0 FAIL or no deploy
make wasm-gui                                 # dev banner + version.json
bin/runSite                                   # assembles site/_dist (then --kill)
D=<tmp>/site-deploy
git clone https://github.com/choupo-admin/choupo-admin.github.io.git "$D"  # or pull
rsync -a --delete --exclude='.git' --exclude='CNAME' --exclude='v*/' \
      site/_dist/ "$D/"                       # NEVER touches the frozen /vYYMM/
cat "$D/CNAME"                                # must still read www.choupo.org
git -C "$D" add -A . && git -C "$D" commit -m "site: dev refresh — <resumo>" \
   && git -C "$D" push origin HEAD:main
```

Freezing a release's app (once, at release time, from the fresh tag):

```bash
git checkout vYYMM
make wasm-gui                                 # stable banner + version.json
cd gui && npx vite build --base=/vYYMM/app/ --outDir dist-vYYMM && cd ..
cp -r gui/dist-vYYMM "$D/vYYMM/app" && rm -rf gui/dist-vYYMM
git -C "$D" add vYYMM && git -C "$D" commit -m "site: freeze Choupo-YYMM app at /vYYMM/app/" \
   && git -C "$D" push origin HEAD:main
```

After any site push: GitHub Pages rebuilds in ~1–3 min, and the service
worker caches — hard-refresh (`Ctrl+Shift+R`) to see the new deploy.

## Citation

`CITATION.cff` at the repo root is the machine-readable citation; the
preferred-citation URL points at the release tag (a moving branch is not a
citable object).  The landing page's "Cite Choupo" section shows the same
reference for the current stable release.
