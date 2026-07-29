# Releasing Choupo

One line of development, immutable tags, one naming convention
(revised 2026-07-29 — this supersedes the two-branch arrangement of
2026-07-20):

```
main          THE DEVELOPMENT LINE, Choupo-dev — the default branch, the
              continuously-updated latest, no pre-announced target version

vYYMM         a release: an IMMUTABLE tag, never deleted, moved or reused
release-YYMM  cut FROM a tag, and only on the day a patch actually ships

Public name:      Choupo-2607
Internal version: 2607        (CITATION.cff, Banner)
Git tag:          v2607
GitHub Release:   tag v2607, title "Choupo-2607"
```

Never use variants (`v26.07`, `2026.07`, `Choupo-v2607`).

**Why the default branch carries the development line.**  The earlier layout
froze `main` at the last release and did the work on `dev`.  OpenFOAM.org —
the model it claimed to follow — does the opposite, and checking rather than
remembering settled it: one repository per version line (`OpenFOAM-dev`,
`OpenFOAM-13`, `OpenFOAM-12`, …) and in **every one of them the default branch
is that line's own**.  No repository in that project holds "default = frozen
release, side branch = the work".  Two lessons, and both apply here: the
development line owns the default branch, and a release is **maintained**, not
photographed.  The old layout also duplicated the release — `main` and `v2607`
were meant to name the same thing, and `main` had already drifted 3 commits
past the tag before anyone looked.  One quantity, one home; a release is a
quantity, and its home is the tag.

`main` is never pinned to a named future release — it is just the latest,
continuously.  Roughly every six months (not a fixed date, and not
pre-announced), whoever is maintaining the project tags it and that tag
becomes the next `Choupo-YYMM`, named for whatever calendar month it actually
lands in.  In practice a tag is usually convenient near a teaching-term start,
but that is a scheduling convenience decided at cut time, never a commitment
baked into the code or docs beforehand.

## Where work goes

- Everything — features and fixes alike — goes to `main`.
- A fix for an **already-released** version goes to `main` first, then is
  cherry-picked onto `release-YYMM`, which is cut from `vYYMM` the first time
  such a fix exists.  Until that day the branch does not exist, because there
  is nothing for it to carry.
- The published tag is never touched by fixes; the `release-YYMM` branch
  carries them and a patch gets its own tag.

## Publishing a release

1. Update the internal version: `src/core/Banner.H` (`CHOUPO_VERSION
   "Choupo-YYMM"`, drop the dev suffix), `CITATION.cff` (`version`,
   `date-released`, preferred-citation tag URL).
2. Update `README.md` and the `CHANGELOG.md` section for the release.
3. Update the landing page (release name, date, citation block).
4. Run everything: `bin/runTests` (0 FAIL), `cd gui && npx tsc --noEmit &&
   npx vitest run`, `make wasm-gui`.
5. Commit and tag:

   ```bash
   git checkout main
   git commit ...                       # the version bump of steps 1-3
   git push origin main
   git tag -a vYYMM -m "Choupo-YYMM"
   git push origin vYYMM
   ```

6. Create the GitHub Release: tag `vYYMM`, title `Choupo-YYMM`, notes from
   the CHANGELOG section.
7. Freeze the release's app at `/vYYMM/app/` (see "Site deployment"); add the
   release to the /releases/ history list and point its "Run" button at the
   frozen copy.
8. Bump the Banner back to `Choupo-dev` (no target string to set — there
   isn't one) and open the next CHANGELOG section, on `main`.

The push in step 5 publishes the site; the tag does not deploy anything by
itself.

## Identification in the binaries

- A tag / a `release-YYMM` branch: `Version: Choupo-YYMM`.
- `main`: `Version: Choupo-dev · commit <short hash>` — no named target; the
  hash matters precisely because the line moves.

## Day-to-day workflow (pushing work)

```bash
git checkout main
# ... work, commit (identity: Vítor Geraldes <talentgroundlda@gmail.com>) ...
bin/runTests            # 0 FAIL before any push
git push origin main    # this also publishes the site
```

Published `vYYMM` tags are never deleted, moved or reused — no exceptions.

## Site deployment (www.choupo.org)

**Publishing is automatic.**  `.github/workflows/publish-site.yml` runs on
every push to `main`, builds the WASM and the app, calls `bin/buildSite` —
the *same* assembler `bin/runSite` uses locally — verifies the pieces a
visitor actually fetches, and deploys to GitHub Pages.  There is no manual
rsync and no second site repository; the click-paths that remain outside the
repo (Pages on, DNS) are in
[`docs/deploying-the-site.md`](docs/deploying-the-site.md).

Rehearse locally before pushing anything that touches the site:

```bash
make wasm-gui           # the app cannot solve without it
bin/runSite             # assembles site/_dist and serves it (then --kill)
```

**`/app/` serves Choupo-dev** — a browser app has no install, so visitors run
the newest line, badged `Choupo-dev · <commit>` in the top bar (the badge
reads `wasm/version.json`, written by the WASM build beside the binaries).

**Freezing a release's app at `/vYYMM/app/` is NOT yet wired into the
workflow.**  Pages replaces the whole published tree on each deploy, so a
frozen copy must be part of what `bin/buildSite` assembles — it cannot be
left behind in the published output the way the old rsync (`--exclude='v*/'`)
left it.  Building it is one `vite build --base=/vYYMM/app/` from the tag;
the open question is where the result *lives* between deploys (checked into
`site/`, or rebuilt from the tag by the workflow).  Decide it at the first
release that needs it, and do not pretend meanwhile that the URL exists.

After any deploy: Pages serves in ~1–3 min, and the service worker caches —
hard-refresh (`Ctrl+Shift+R`) to see it.

## Citation

`CITATION.cff` at the repo root is the machine-readable citation; the
preferred-citation URL points at the release tag (a moving branch is not a
citable object).  The landing page's "Cite Choupo" section shows the same
reference for the current stable release.
