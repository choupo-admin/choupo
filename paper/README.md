# paper/ — the JOSS submission draft

This folder holds the draft paper for the *Journal of Open Source Software*
(https://joss.theoj.org): `paper.md` (JOSS Markdown + YAML front matter) and
`paper.bib` (the references).

## Before submitting (Vítor's checklist)

1. **Authorship** — decide the author list (the AUTHORS file lists the code
   copyright holders; PAPER authorship is a separate decision) and fill in
   the real ORCID(s) in `paper.md`.
2. **Word count** — JOSS wants 250–1000 words for Summary + Statement of
   need; the draft sits inside that.
3. **Archive** — on acceptance JOSS asks for a Zenodo/figshare DOI of the
   tagged release; `CITATION.cff` is already in the repo root.
4. **Preview** — render locally with the JOSS preview action, or:
   `docker run --rm -v $PWD/paper:/data openjournals/inara -o pdf paper.md`
5. **Submit** at https://joss.theoj.org/papers/new (repository URL + this
   paper path).  Review happens as a public GitHub issue.

JOSS review criteria the repo already meets: OSI licence (GPL-3.0-or-later),
public repository, installation + usage documentation (`docs/`, `README.md`),
automated tests (`bin/runTests`), community guidelines (`CONTRIBUTING.md`),
version tag (`Choupo-2607`).

## The two artifacts

- **`paper.md`** — the JOSS submission (JOSS only accepts Markdown and
  caps Summary + Statement of need at 250–1000 words).
- **`paper.tex`** — the FULL companion article on Choupo-2607 (~7 pages:
  architecture, case grammar, thermodynamics, numerics, unit operations,
  the three-level conservation discipline, the browser front-end,
  validation, data governance, limitations).  Preprint / co-author
  circulation; shares `paper.bib`.  Build:
  `pdflatex paper && bibtex paper && pdflatex paper && pdflatex paper`.

When facts change (new release numbers, new validations), update BOTH —
the .md is the submission artifact, the .tex is the full story.
