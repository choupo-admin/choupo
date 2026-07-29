# Putting Choupo-dev online at www.choupo.org

The site is **static**. `choupoSolve` and friends ship as WebAssembly and run
in the visitor's own browser tab — no server solves a flash, there is no
per-user state, and a case a visitor opens never leaves their machine. That is
why a static host is enough, and it is the property to preserve: the day this
needs a backend is the day it needs a different design review.

## What is already done

| piece | where |
|---|---|
| the assembler | `bin/buildSite` — **one** recipe, used by the local rehearsal *and* the publish workflow |
| the local rehearsal | `bin/runSite` (serves what `buildSite` produced, at `:4180`) |
| the publish workflow | `.github/workflows/publish-site.yml`, on every push to `dev` |
| the custom domain | `site/CNAME` → `www.choupo.org`, copied into the published root |

The chain was run end to end before the workflow was written: `make wasm-gui`
(7 min), `npm ci`, `npm run build`, `bin/buildSite` → **51 MB**, served, and
every route fetched: `/` 38 kB, `/app/`, `/models/`, `/releases/`,
`wasm/choupoSolve.wasm` 5.8 MB, `releaseInventory.json`.

## The two things a script cannot do

Both are one-time, both need Vítor, and until both are done the workflow
builds and uploads fine and **fails at the deploy step** — which is the right
signal: nothing gets silently half-published.

### 1. Turn Pages on

`github.com/choupo-admin/choupo` → **Settings** → **Pages** →
*Build and deployment* → **Source: GitHub Actions**.

Then, once the first deploy has run, on the same page set the custom domain to
`www.choupo.org` and tick **Enforce HTTPS** (the certificate is issued
automatically, usually within the hour).

### 2. Point the domain

At whoever holds `choupo.org`:

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

(Or a single `ALIAS`/`ANAME` to `choupo-admin.github.io.` if the registrar
supports it — cleaner, and it follows GitHub if those addresses ever change.)

`www` is the canonical name in `site/CNAME`; the apex redirects to it.

## What visitors download

The app bundle is ~26 MB raw and **3.4 MB gzipped**, plus `choupoSolve.wasm`
at 5.8 MB. Pages serves the gzip, so a first visit is roughly **9 MB** and the
service worker (`site/sw.js`) caches it afterwards. That is a heavy first
load, and it is the honest cost of shipping a whole process simulator to a
browser rather than a screenshot of one — worth revisiting (code-splitting the
26 MB chunk is the obvious lever) but not a blocker.

Pages' limits: 1 GB per site (we use 51 MB) and a soft 100 GB/month of
bandwidth (~11 000 first visits). Neither binds for a teaching site.

## What is published, and from where

`dev`, on every push — the branch is `Choupo-dev`, the continuously updated
development line, which is what "operational online" was asked for. `main`
publishes nothing today; when a release is tagged and that changes, it is one
more `on: push:` entry and a second Pages environment, not a redesign.

Nothing under `data/local/` or `thirdParty/` is in the repository, so nothing
of either can reach the site — the licence scrub holds by construction, not by
a step in this file.
