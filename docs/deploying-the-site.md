# Putting Choupo-dev online at www.choupo.org

The site is **static**. `choupoSolve` and friends ship as WebAssembly and run
in the visitor's own browser tab — no server solves a flash, there is no
per-user state, and a case a visitor opens never leaves their machine. That is
why a static host is enough, and it is the property to preserve: the day this
needs a backend is the day it needs a different design review.

## Read this first: the site is a SECOND repository

`www.choupo.org` is served by **`choupo-admin/choupo-admin.github.io`** — the
user site. That repository holds the `CNAME` and the frozen release copies
under `/vYYMM/app/`. *This* repository builds the site; it does not serve it.

That distinction cost a day. On 2026-07-29 a workflow was written that ended
in `actions/deploy-pages`, publishing this repository's own Pages: a second
site, at a different address, that nobody visits — and it uploaded a `CNAME`
claiming a domain the user site already owned. Every run was green while
`www.choupo.org` served a bundle **55 commits old**. The symptom that gave it
away was a user noticing a tutorial missing from the *Open Case* list; the
proof was one line:

```
served wasm/version.json → { "Choupo-dev", "fb458284" }   # 26 July
built  wasm/version.json → { "Choupo-dev", "b87d5482" }   # today
```

**Two repositories must never claim one domain.** The workflow now builds and
verifies only; publishing is the procedure in
[`RELEASING.md`](../RELEASING.md).

| piece | where |
|---|---|
| the assembler | `bin/buildSite` — **one** recipe, used by the local rehearsal, the publish procedure *and* the CI check |
| the local rehearsal | `bin/runSite` (serves what `buildSite` produced, at `:4180`) |
| the CI check | `.github/workflows/publish-site.yml` — builds on every push to `main`, publishes nothing |
| the published site | `choupo-admin/choupo-admin.github.io`, branch `main` |
| the custom domain | that repo's own `CNAME` → `www.choupo.org` |

## The badge is the staleness check

The app's top bar reads `wasm/version.json` and shows `Choupo-dev · <commit>`.
**If the badge on the live site is not the commit you pushed, the deploy did
not land.** It costs one glance and it is the check that was missing for the
whole 55 commits. Hard-refresh first (`Ctrl+Shift+R`) — the service worker
caches aggressively, so a stale badge can also be your own browser.

The build now asserts a matching property from the other side: it greps the
bundle for a tutorial that exists in the corpus. A bundle that cannot name its
own cases is not the simulator the tutorials describe.

## The one secret that turns publishing automatic

`publish-site.yml` already pushes into the site repository — it just needs a
key, because `GITHUB_TOKEN` cannot write to another repository. Use an SSH
**deploy key**, not a PAT: a deploy key is scoped to one repository and never
expires, where a PAT carries the whole account and a renewal date.

**1. Generate the pair** (once, on your machine):

```bash
ssh-keygen -t ed25519 -C "choupo site deploy" -f ~/choupo-site-deploy -N ""
```

**2. The PUBLIC half → the SITE repo.** `cat ~/choupo-site-deploy.pub`, then
[site repo → Settings → Deploy keys](https://github.com/choupo-admin/choupo-admin.github.io/settings/keys)
→ *Add deploy key* → paste → **☑ Allow write access** ← without this tick the
push is refused → *Add key*.

**3. The PRIVATE half → THIS repo.** `cat ~/choupo-site-deploy`, copy it
whole (`-----BEGIN` and `-----END` lines included), then
[this repo → Settings → Secrets → Actions](https://github.com/choupo-admin/choupo/settings/secrets/actions)
→ *New repository secret* → name it exactly **`SITE_DEPLOY_KEY`** → paste →
*Add secret*.

**4.** `rm ~/choupo-site-deploy ~/choupo-site-deploy.pub` — each half now
lives where it belongs.

Until the secret exists the workflow builds, verifies, and prints a notice
saying it did not publish. It does not fail: a missing key is a true state of
the world, and a red X there would train everyone to ignore the run — which is
exactly how the site went 55 commits stale unnoticed.

Two guards run before the workflow commits anything: the `CNAME` must still
name the site, and the frozen `/vYYMM/app/` copies must still exist. Both are
protected by `--exclude` in the rsync; the assertions catch the day someone
edits that line.

## The domain

Already in place, and confirmed resolving:

```
www    CNAME   choupo-admin.github.io.
```

and, so the bare domain works too, the four Pages apex addresses:

```
@      A       185.199.108.153
@      A       185.199.109.153
@      A       185.199.110.153
@      A       185.199.111.153
```

`www` is the canonical name in the site repo's `CNAME`; the apex redirects to
it. **Enforce HTTPS** is a tick on that repository's *Settings → Pages* once
the certificate issues.

## What visitors download

The app bundle is ~26 MB raw and **3.4 MB gzipped**, plus `choupoSolve.wasm`
at 5.8 MB. Pages serves the gzip, so a first visit is roughly **9 MB** and the
service worker (`site/sw.js`) caches it afterwards. That is a heavy first
load, and it is the honest cost of shipping a whole process simulator to a
browser rather than a screenshot of one — worth revisiting (code-splitting the
26 MB chunk is the obvious lever) but not a blocker.

Pages' limits: 1 GB per site (the site repo uses 100 MB, of which 56 MB is the
frozen `/vYYMM/`) and a soft 100 GB/month of bandwidth (~11 000 first visits).
Neither binds for a teaching site.

Nothing under `data/local/` or `thirdParty/` is in the repository, so nothing
of either can reach the site — the licence scrub holds by construction, not by
a step in this file.
