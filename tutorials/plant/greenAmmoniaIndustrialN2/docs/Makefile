#---------------------------------------------------------------------------
#  Case documents for tutorials/plant/greenAmmoniaIndustrialN2.
#
#  SELF-CONTAINED, and deliberately NOT part of docs/Makefile at the
#  repository root.  That Makefile's `DOCS :=` line is the ONE home for which
#  guides are public, and check_guide_pdf_fresh reads it; adding a case
#  document there would file a coursework brief as a manual.
#
#  The rule below is what keeps these PDFs from being SOURCELESS BINARIES --
#  the 2026-09-03 rule: a tracked .pdf that no Makefile rule builds is outside
#  every source gate at once.
#
#      make            build both PDFs
#      make clean      remove LaTeX debris (keeps the PDFs)
#      make distclean  remove the PDFs too
#---------------------------------------------------------------------------
DOCS  := projectBrief thermoBasis
PDFS  := $(addsuffix .pdf,$(DOCS))
LATEX := pdflatex -interaction=nonstopmode -halt-on-error

.PHONY: all clean distclean
all: $(PDFS)

#  Twice: the second pass resolves the cross-references and the page numbers
#  the first pass could only guess at.
%.pdf: %.tex preamble.tex
	$(LATEX) $< >/dev/null || { $(LATEX) $<; exit 1; }
	$(LATEX) $< >/dev/null

clean:
	rm -f *.aux *.out *.toc *.log *.fls *.fdb_latexmk

distclean: clean
	rm -f $(PDFS)
