# Help opens at the section, in a tab — not as a download

*Status: SHIPPED 2026-08-17 (`892f7587`), with the measurements below.*
*Raised by Vítor three times, escalating, against three different surfaces
(the F1 key, the Help menu, the EduTools Theory button).  The third report is
the one that made it an architecture question rather than a bug.*

---

## 1. The complaint, in the reporter's words

> "a tecla F1 devia de abrir o manual pdf num tab diferente e exatamente na
> página certa, mas apenas faz o download do ficheiro todo"

and, after a first attempt at fixing it:

> "Quando se clica no help devia de abrir num tab o pdf na secção
> correspondente"

Two distinct failures are folded into one sentence, and they have **different
causes**.  Separating them is most of the work.

---

## 2. What was measured

### 2.1 The anchor is not the problem

`ch:rotating` — the destination the Pump-vs-system tool links to — **exists in
the built PDF**.  Extracted by decompressing every `FlateDecode` stream and
matching named destinations:

| artefact                        | named destinations (`ch:` / `sec:` …) | `ch:rotating` |
|---------------------------------|---------------------------------------|---------------|
| `docs/theoryGuide.pdf` (fresh)  | 549                                   | present       |
| `site/_dist/docs/theoryGuide.pdf` | 527                                 | present       |

The deployed copy carries 22 fewer destinations than a fresh build — it is
stale, which is a separate finding and not this one's cause.  **The link and
the anchor are both correct.**

### 2.2 The opener IS a defect, and it is ours

`gui/src/ui/MenuBar.tsx`, six call sites:

```js
window.open(url, "_blank", "noopener")
```

The third argument is the **windowFeatures** string.  A non-empty features
string asks the browser for a **popup window**, not a tab.  Every Help-menu
entry — "Help on current view" and all four manuals — therefore opens in the
wrong kind of window, which is literally the thing the report asks not to
happen.  The correct form for a tab is the two-argument call (browsers imply
`noopener` for `_blank` since 2021) or an anchor with `rel="noopener"`.

This is provable from the source and is fixed here.  It is **not** established
that it is the whole cause of what the reporter sees.

### 2.3 The download is NOT fixable from our side, and that is the finding

Whether a PDF renders in a tab or lands in the Downloads folder is decided by
the **response headers** and the **browser's PDF handler**.  We control
neither:

* the site is published to a separate repository served by **GitHub Pages**,
  which offers **no header control at all** — we cannot send
  `Content-Disposition: inline`;
* Firefox's per-profile "Portable Document Format (PDF) → Save File" setting,
  and several extensions, override the page's intent regardless of headers.

The live headers could not be read from the build container: the agent proxy
denies `www.choupo.org` (`connect_rejected`, policy denial, observed
2026-08-17).  So the production `Content-Type` is **unmeasured**, and this
record does not claim to know it.

The conclusion does not depend on that missing measurement:

> **While Help points at a PDF, whether it opens is a property of the
> student's browser profile, not of Choupo.**

A help system that works or does not work depending on a Firefox preference is
not a help system.  That is the architectural defect, and the popup fix does
not touch it.

### 2.4 The route that would have been nicest is blocked

Generating HTML from the same `.tex` (real `#ch:rotating` anchors, readable on
a phone, no PDF handler involved) was the first choice.  It was measured and
rejected **on availability, not on taste**:

* `tex4ht` and `t4ht` binaries are present, but their support files are **not**
  — no `tex4ht.sty`, no `tex4ht.env`, no `htlatex`, no `make4ht`.  The binaries
  alone do nothing.
* `docs/preamble.tex` uses `pgfplots`; under tex4ht every such figure becomes a
  generated image through a second toolchain.

So this route means changing the TeX installation in CI *and* accepting a
fragile conversion of every figure in a 23 298-line guide.  It is not the small
slice it looked like.  Recorded here so the next person does not re-discover
it.

---

## 3. The decision

**Choupo draws the guide itself.**  A viewer page,
`/docs/view.html?g=theoryGuide#nameddest=ch:rotating`, renders the PDF inside
our own page (pdf.js, Apache-2.0 — permissive, GPL-3.0-or-later compatible, in
the same class as the Plotly the GUI already ships).

Because the bytes are drawn by our page into a canvas, they never reach the
browser's PDF handler.  There is no download to suppress and no header to set.
The outcome stops depending on the reader's configuration — which is the whole
point.

What this deliberately does NOT do:

* it does not replace the PDF — the manuals are still built by `docs/Makefile`
  and still downloadable on purpose, from a link that says so;
* it does not claim to be the HTML guide.  A canvas is not reflowable text; a
  phone reader is served better than by a download prompt and worse than by
  real HTML.  §2.4 stays open as the better answer, blocked on a toolchain.

### 3.1 One home for the URL

The change is only safe if there is a single place that knows how a guide URL
is built.  Today there are **six**:

| site | what it builds |
|---|---|
| `gui/src/help/helpMap.ts` (`helpUrl`) | F1 context help |
| `gui/src/case/modelDocs.ts` (×3) | unit-op, props-op and model deep links |
| `gui/src/ui/methods/registry.ts` (`theoryUrl`) | the EduTools Theory button |
| `gui/src/ui/ExploreWorkspace.tsx` | property-surface theory link |
| `gui/src/ui/PropsView.tsx` | props theory link |
| `gui/src/ui/MenuBar.tsx` (×4 literals) | the four manuals |

Six homes for one derived quantity is the arity sin, and it is exactly why
fixing the F1 path earlier never reached the button the report was pointing at.
The slice collapses them onto one builder and one opener; anything that wants a
guide asks that builder.

---

---

## 3.2 What shipped, and what building it found

`gui/public/guide.html` draws the guide; `gui/src/help/guideLinks.ts` is the
single home for the URL and for the opening; the six builders and the six
popup openers are gone.  pdf.js 4.10.38 (Apache-2.0) is staged into
`public/pdfjs/` by `scripts/copyDocs.mjs`, gitignored like the PDFs, and its
absence **refuses** rather than warning — a viewer that silently opens nothing
is the failure mode this whole record is about.

Verified by `gui/tools/checkGui/checkGuideViewer.mjs`, which drives the real
browser and compares the landing page against the **document's own destination
table**:

```
  ch:rotating        page 215  of 285  = the document's own destination page
  ch:coolingTower    page 231  of 285  = the document's own destination page
```

**Three versions of that check were needed, and the two weak ones are the
finding.**  The first asserted "the anchor moved the reader off page 1".  It
passed — while the viewer put **both** anchors on page 208, against a document
that places them at 215 and 231.  Off page 1, moved, wrong chapter, green.
The second added "two anchors must land on different pages", and that is what
failed and exposed it.  Only the third — *land exactly where the document says*
— is worth keeping.

The defect underneath was mine and generalises past this page: `page-width`
scaling is computed from the container's `clientWidth`, the container was still
`hidden` when the scale was set, **a hidden element measures zero**, and pdf.js
accepted the resulting **negative** `--scale-factor`, laid out 18-pixel pages,
and went on reporting the destination's page number while `scrollTop` never
moved. The page counter said 208, the pixels said page 3, the DOM said 285
pages existed. *Three surfaces, three different lies, no error anywhere.*  A
check that reads only one surface would have believed it.

Not wired into `bin/runTests`: it needs a dev server and a browser, exactly
like `bin/checkGui`.  Wiring either one must follow the `gui-typecheck`
posture — **SKIP loudly when the prerequisites are absent, never PASS**.

## 4. What would falsify this

* If the production headers turn out to send `Content-Disposition: attachment`
  **and** we gain header control (a host change), then §2.3's "not fixable from
  our side" is wrong and the viewer is a heavier answer than needed.  The
  measurement is still owed and is named as owed.
* If pdf.js's own named-destination handling does not reach `ch:rotating` on the
  built guides, the viewer solves the download and not the deep link — which is
  half the complaint, and would have to be said plainly rather than shipped
  quietly.
