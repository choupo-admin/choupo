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

## LaTeX twin

`paper.tex` produces the same article as a standalone PDF (preprint /
co-author circulation), sharing `paper.bib`.  Build:
`pdflatex paper && bibtex paper && pdflatex paper && pdflatex paper`
(3-page PDF, zero errors).  **JOSS itself only accepts `paper.md`** — keep
the two in sync when editing; the .md is the submission artifact.
