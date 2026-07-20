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
7. Deploy the site (see the deploy procedure) so the landing shows the new
   stable release.
8. On `dev`: bump the Banner to `Choupo-dev` with the next target release,
   and open the next CHANGELOG section.

## Identification in the binaries

- Stable (`main` / a tag): `Version: Choupo-YYMM`.
- Development (`dev`): `Version: Choupo-dev · target Choupo-YYMM ·
  commit <short hash>` — the hash matters precisely because dev moves.

## Citation

`CITATION.cff` at the repo root is the machine-readable citation; the
preferred-citation URL points at the release tag (a moving branch is not a
citable object).  The landing page's "Cite Choupo" section shows the same
reference for the current stable release.
