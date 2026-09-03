# Releasing Choupo

One line of development, immutable tags, one naming convention
(revised 2026-07-29 — this supersedes the two-branch arrangement of
2026-07-20):

```
main          THE DEVELOPMENT LINE, Choupo-dev — the default branch, the
              continuously-updated latest, no pre-announced target version

vYYMM         a release: an IMMUTABLE tag, never deleted, moved or reused
vYYMM.N       a PATCH of that release, tagged on its release-YYMM branch
release-YYMM  cut FROM a tag, and only on the day a patch actually ships

Public name:      Choupo-2608
Internal version: 2608        (CITATION.cff, Banner)
Git tag:          v2608
GitHub Release:   tag v2608, title "Choupo-2608"
```

Never use variants (`v26.08`, `2026.08`, `Choupo-v2608`).

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
continuously.  Periodically (not a fixed date, and not pre-announced),
whoever is maintaining the project tags it and that tag
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

**A PATCH TAG IS `vYYMM.N`, AND IT DOES NOT MAKE A NEW RELEASE** (settled
2026-09-02, when the first patch actually shipped and the rule above turned
out never to have said what "its own tag" looks like).  `v2608.1` is a
packaging fix to Choupo-2608, so **everything a reader cites stays put**: the
public name is still `Choupo-2608`, `CHOUPO_VERSION` is *not* restamped (a
frozen app announcing `Choupo-2608.1` would name a version no citation
carries — the same lie in the other direction), the citation and the badge do
not move, and `freeze-app` publishes the built copy at **`/vYYMM/app/`**, the
address `/releases/` tells a student to cite.  A patch that moved the URL
would be a release under another name.  What the patch tag buys is the
record: which commit the published bytes were built from, readable a year
later.  A change that alters an *answer* is not a patch — it is the next
release.

**A PATCH MAY BE FOLDED INTO ITS RELEASE TAG — once, recorded, and only
while the release's own commit was never runnable as the release (ruled
2026-09-03, Vítor: "one release, one tag").**  `docs/folded-patches.txt` is
the whole of the authorisation, on the `withdrawn-releases.txt` model, and
`fold-patch.yml` executes exactly the recorded pair of commits and nothing
else: the release tag comes to name the patch commit, the patch tag and the
`release-YYMM` branch are deleted, and `generated/releases/vYYMM.json` is
regenerated on `main` afterwards (until it is, `check_release_identity`
refuses — that is the gate doing its job).  The window is the one the
record file states: v2608's own frozen app was a shell, so nobody ever ran
Choupo-2608 at the tag's first commit; a release whose own copy has been
served correctly cannot be folded later.

## Publishing a release

1. Update the internal version: `src/core/Banner.H` (`CHOUPO_VERSION
   "Choupo-YYMM"`, drop the dev suffix), then **run
   `bin/curate/banner_version.py`** — it restamps the decorative
   `Version:  Choupo-...` banner label on every tracked file from Banner.H,
   and `banner-version-gate` fails the suite if you skip it.  Then
   `CITATION.cff` (`version`, `date-released`, preferred-citation tag URL).
2. Update `README.md` and the `CHANGELOG.md` section for the release.  **The
   heading must take the bracketed form `## [Choupo-YYMM] — YYYY-MM-DD`**:
   that is the shape `release_inventory.py`'s `release_id()`/`released_at()`
   match, and it is what decides which release the storefront announces.  A
   prose heading leaves the whole site announcing the PREVIOUS release from a
   tree that has just cut this one — silently, because nothing else reads it.
   Then regenerate the dev inventory: `bin/curate/release_inventory.py`
   (writes `generated/releaseInventory.json`, whose `latestRelease` follows
   that heading).
3. Update the landing page: `site/index.html`, `site/models.html` and
   `site/releases.html` — release name, date, citation block, the `/vYYMM/app/`
   Run links, the `blob/vYYMM/CITATION.cff` and `tree/vYYMM/docs` links, and
   the `/releases/vYYMM.json` fetch.  Move the previous release into the
   history list.  Do NOT hand-fill the `data-inv` literals yet; step 6 does it
   from the artefact.
4. Run everything: `bin/runTests` (0 FAIL), `cd gui && npx tsc --noEmit &&
   npx vitest run`, `make wasm-gui`.
5. Commit and tag (do NOT push yet — steps 6-8 still change the tree):

   ```bash
   git checkout main
   git commit ...                       # the version bump of steps 1-3
   git tag -a vYYMM -m "Choupo-YYMM"
   ```

6. Generate the release artefact — it records the commit its tag resolves to,
   so it can only exist AFTER the tag:

   ```bash
   bin/curate/release_inventory.py --release vYYMM   # generated/releases/vYYMM.json
   ```

   Then refill every `data-inv` literal in the three site pages from that
   artefact and run `bin/curate/check_release_identity.py` until it is OK.
   The gate reads the NEWEST artefact, so literals that were true for the last
   release are now stale by definition — this is the arm doing its job, not a
   regression.
7. Bump the Banner back to `Choupo-dev` (no target string to set — there
   isn't one), **re-run `bin/curate/banner_version.py`**, and open the next
   CHANGELOG section on `main` as `## Choupo-dev (unreleased)` — unbracketed,
   so `release_id()` keeps pointing at the release you just cut.  Commit this
   as a follow-up; the suite is expected to be green HERE, not at the tag.
8. Push both commits, then run the workflows.  **Steps 5-8 stopped being
   manual on 2026-09-02**, because a release performed partly by hand and
   partly by CI is one that can be half-published, and on that day it was: the
   site was pushed for a tag that did not exist and four public links went
   live dead at once.  Each is `workflow_dispatch`, startable only by someone
   who already has write access, and each refuses rather than guesses:

   | workflow | what it does | inputs |
   |---|---|---|
   | `release-tag` | creates the annotated tag and reads it back from the remote | `tag`, full 40-char `sha` |
   | `release-notes` | creates or updates the GitHub Release, notes taken from **the tag's own** CHANGELOG section | `tag` |
   | `freeze-app` | builds the app **from the tag** with `--base=/vYYMM/app/` and publishes it beside the other releases | `tag` |

   Then add the release to the `/releases/` history and, **only once
   `freeze-app` has actually published**, add its id to `site/frozenApps.txt`
   and point the "Run" buttons at the frozen copy.  That order is the gate's:
   a `/vYYMM/app/` link whose id is not declared there is refused.

   **THE FROZEN APP WAS A SHELL UNTIL 2026-09-02, and the checks that were
   supposed to prevent it could not see it.**  The app fetched its engine from
   two root-absolute literals (`gui/src/adapters/wasmModule.ts`, and
   `gui/public/workers/solverWorker.js`, which vite never rewrites because it
   is plain JavaScript in `public/`), so a copy served from `/vYYMM/app/`
   loaded correctly, and then on running a case fetched `Choupo-dev` from the
   site root — true of `/v2607/app/` as well, so no frozen release had ever
   run its own engine.  Checks (1)–(4) all passed on it, because every one of
   them reads what the app *is at rest*: the entry point, the binary, the
   manifest.  Check (5) reads what it **fetches when it runs**, which is the
   only place the defect was ever visible.  Fixed on the development line and
   shipped as `v2608.1`.

   **After `freeze-app` reports `published /vYYMM/app/`, DRIVE THE COPY:**

   ```bash
   bin/drive-app --mirror https://www.choupo.org/vYYMM/app/ /tmp/frozen --first-path
   ```

   It fetches the served copy (lazy chunks included), serves it under the
   same prefix, opens every `tier tutorial;` case in a real Chromium, runs
   it, walks every view, and reports any request that leaves the prefix,
   any view that throws, and any disabled control's hint.  This is the
   instrument that found the frozen-shell defect and the only kind of check
   that could have; the five checks inside `freeze-app` read the copy at
   rest.  It is a TOOL and not a gate (it needs a browser and a served
   copy — the Poling precedent), which is why this step is written here,
   where it cannot be skipped by a green suite.  Exit 1 is a finding to
   read; exit 2 means it could not honestly run.

   `freeze-app` will not overwrite a frozen app — with **two exceptions, each
   proved from the published bytes before it acts**.  The first is in the
   shape of `withdraw-release`: a copy whose worker fetches its engine from a
   root path never was a frozen copy of anything, and is replaced.  The
   second is a later patch of the same line (rule written 2026-09-03; no
   second patch has shipped): a patch is published at the release's own
   address, so the second patch of a line necessarily replaces the copy the
   first one built.  The copy records
   the commit it was built from in `wasm/version.json`; the guard admits a
   `vYYMM.N` tag only when that commit is in the checked-out history AND an
   ancestor of the tag — a copy with no recorded commit, one this line did
   not produce, one already at the tag's own commit, or a tag that does not
   descend from it, is refused.  "Never touched" therefore means *never
   replaced by anything the release line did not itself produce later*; the
   tag list, which is immutable, records which bytes were served when.

   To withdraw a release, write the decision into
   `docs/withdrawn-releases.txt` first and then run `withdraw-release`; it
   refuses any tag that record does not name.

The push in step 8 publishes the site; the tag does not deploy anything by
itself.  The tagged commit is deliberately NOT a green tree: the release
artefact and the banner's return to `Choupo-dev` both belong to the follow-up
commit, so `check_release_identity` and `banner-version-gate` are satisfied at
the head, not at the tag.

**PUSH THE TAG BEFORE THE SITE, not after.**  On 2026-09-02 the site was
published for a tag that did not exist yet, and four links went live dead at
once: the release page, `blob/vYYMM/CITATION.cff`, `tree/vYYMM/docs` and the
frozen app.  Three of them need only the tag; the fourth needs the upload in
step 8.  A storefront for a release nobody can fetch is worse than no
storefront.

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

**The site lives in a SECOND repository: `choupo-admin/choupo-admin.github.io`.**
That repository holds the `CNAME`, and it holds the frozen release copies
under `/vYYMM/`. This repository builds the site; it does not serve it.

Read that twice before automating anything here. On 2026-07-29 a workflow
was added that ended in `actions/deploy-pages`, publishing *this*
repository's Pages — a second site, at another address, that nobody visits,
uploading a `CNAME` claiming a domain the user site already owns. It was
green for a whole afternoon while `www.choupo.org` served a bundle 55
commits old. Two repositories claiming one domain is how a live site gets
taken away from under itself. The workflow now **builds and verifies only**.

**Publishing is deliberate.** With the site repo checked out at `$D`:

```bash
git checkout main
bin/runTests                                  # 0 FAIL or no deploy
make wasm-gui                                 # WASM + version.json (the badge)
bin/curate/guide_version.py && make -C docs all   # the PDFs, carrying the label
bin/buildSite                                 # assembles site/_dist
#  THE DOCS BUILD IS A PREREQUISITE, not an optional tidy (learned
#  2026-08-14).  `bin/buildSite` REFUSES when a guide PDF about to be
#  published does not carry the version label -- a guide naming a version it
#  does not describe is worse than an undated one, because the wrong label is
#  believed.  The remedy it prints is the line above, and on that day the
#  remedy itself FAILED: theoryGuide.tex had been opening three `warning`
#  environments that are defined nowhere, so the guide had not compiled since
#  the commit that added them and nothing in the suite noticed -- no gate
#  builds the guides, and this refusal only fires when a person runs the
#  publish.  `check_guide_environments` now catches that class statically on
#  every runTests; `make -C docs all` remains the only real proof, and it
#  belongs here, in the sequence, rather than in an error message.
#
#  --delete so removals propagate; the two --exclude are load-bearing:
#  CNAME is the site repo's own, and v*/ are the frozen releases.
rsync -a --delete --exclude='.git' --exclude='CNAME' --exclude='v*/' \
      site/_dist/ "$D/"
cat "$D/CNAME"                                # must still read www.choupo.org
ls -d "$D"/v*/app                             # the frozen copies must survive
git -C "$D" add -A . && git -C "$D" commit -m "site: dev refresh — <resumo>" \
   && git -C "$D" push origin main
```

**Verify what you are about to publish, not just that it built.** The
staleness above was invisible because nothing compared the *bundle* to the
*corpus*. Before pushing, grep `site/_dist/assets/` for a case that is new
since the last deploy — if the bundle cannot name it, the site is not the
simulator the tutorials describe. The workflow now asserts this too.

**The workflow does this automatically once one secret exists.**
`publish-site.yml` runs the same chain on every push to `main` and pushes
into the site repo over SSH. It needs a deploy key, because `GITHUB_TOKEN`
cannot write to another repository — and a deploy key is scoped to one repo
and never expires, where a PAT would carry the whole account and a renewal
date. Set it up once:

```bash
ssh-keygen -t ed25519 -C "choupo site deploy" -f ~/choupo-site-deploy -N ""
```

| half | where it goes |
|---|---|
| `~/choupo-site-deploy.pub` (public) | **site** repo → Settings → Deploy keys → Add, **☑ Allow write access** |
| `~/choupo-site-deploy` (private) | **this** repo → Settings → Secrets → Actions → name it `SITE_DEPLOY_KEY` |

Paste the private half whole, `-----BEGIN`/`-----END` lines included. Then
delete both local files — each half already lives where it belongs.

Until the secret exists the workflow builds, verifies, and says in the log
that it did not publish — a missing key is a true state of the world, not a
broken build, and a red X there would train everyone to ignore the run.

**`/app/` serves Choupo-dev** — a browser app has no install, so visitors run
the newest line, badged `Choupo-dev · <commit>` in the top bar (the badge
reads `wasm/version.json`, written by the WASM build beside the binaries).
If the badge on the live site is not the commit you just pushed, the deploy
did not land — that badge is the cheapest staleness check there is.

**Freezing a release's app at `/vYYMM/app/`**, once, at release time:

```bash
git checkout vYYMM
make wasm-gui                                 # stable banner + version.json
cd gui && npx vite build --base=/vYYMM/app/ --outDir dist-vYYMM && cd ..
cp -r gui/dist-vYYMM "$D/vYYMM/app" && rm -rf gui/dist-vYYMM
git -C "$D" add vYYMM && git -C "$D" commit -m "site: freeze Choupo-YYMM app at /vYYMM/app/" \
   && git -C "$D" push origin main
```

The frozen copies survive every later refresh because of `--exclude='v*/'`
above. That exclusion is the whole mechanism — do not drop it.

After any push: Pages serves in ~1–3 min, and the service worker caches —
hard-refresh (`Ctrl+Shift+R`) to see it.

## Citation

`CITATION.cff` at the repo root is the machine-readable citation; the
preferred-citation URL points at the release tag (a moving branch is not a
citable object).  The landing page's "Cite Choupo" section shows the same
reference for the current stable release.
