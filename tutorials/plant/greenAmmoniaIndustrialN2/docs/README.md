# Case documents

Two documents belong to this case. Both are built from the LaTeX beside them —
`make` here rebuilds both, so neither is a binary without a source.

| Document | What it is |
|---|---|
| `projectBrief.pdf` | The PEQ 2026-27 project brief, revised edition. States the battery limits, the design basis, what the plant measures, and the price study the appraisal actually turns on. |
| `thermoBasis.pdf` | Every model and every parameter this case uses, part by part, with the file each fact lives in. |

```bash
make            # build both PDFs
make clean      # remove LaTeX debris, keep the PDFs
```

Two conventions these documents keep, and which are worth keeping in yours:

* **A number in bold was read off a Choupo run or a Choupo file**, and can be
  reproduced by running the case. Anything not marked that way is either a
  declared input or an assumption somebody has to defend.
* **What the documents will not do is dress up an absence.** The green boxes
  are the paragraphs that say what is missing, what is extrapolated, and what
  is a known open item in the engine rather than in the case.

These files are deliberately **not** part of `docs/Makefile` at the repository
root: that Makefile's `DOCS :=` line is the one home for which *guides* are
public, and a coursework brief is not a manual. They are also excluded from the
GUI's tutorial bundle (`gui/src/cases/tutorials.ts`) — the bundle inlines every
case file as a raw string, and a PDF inlined that way is several hundred
kilobytes of noise shipped to every visitor.
