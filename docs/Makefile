# Makefile --- build the Choupo manuals (LaTeX -> PDF)
#
# Usage:
#   make           # build both PDFs
#   make user      # only userGuide.pdf
#   make dev       # only developerGuide.pdf
#   make clean     # remove .aux/.log/.toc/.out
#   make distclean # also remove .pdf

LATEX       := pdflatex
LATEXFLAGS  := -interaction=nonstopmode -halt-on-error -file-line-error

# THE PUBLIC GUIDES -- and this line is the ONE HOME for that list.
#
# It is not just the build list any more.  `gui/scripts/copyDocs.mjs` PARSES
# this assignment to decide what to stage into the app and what to write into
# `public/docs/guides.json`, which is the allowlist `gui/public/guide.html`
# reads.  Before that, the same list was written out by hand in three places
# and they had drifted: docs/ holds .tex + .pdf for designGuide, explorerGuide
# and tutorialsGuide, none of which `make all` builds and none of which the
# app can open -- three manuals that exist and are unreachable.
#
# Adding a guide here is therefore the whole edit.  Removing one un-publishes
# it.  If you add a name, copyDocs REFUSES until it also has a display label,
# because a guide with no label would appear in the app as a bare key.
DOCS        := userGuide developerGuide theoryGuide propsGuide eduToolsGuide
PDFS        := $(addsuffix .pdf, $(DOCS))

.PHONY: all user dev theory props clean distclean

all: $(PDFS)

user:   userGuide.pdf
dev:    developerGuide.pdf
theory: theoryGuide.pdf
props:  propsGuide.pdf

# The tutorials guide \input{}s one part file per category -- editing a part
# must rebuild the master (found stale: a new still04 entry left the PDF
# "up to date").
tutorialsGuide.pdf: $(wildcard tutorialsGuide-*.tex)

# Two passes so the TOC resolves.
# The props guide \input{}s a GENERATED operations reference (rendered from
# gui/schemas/operations/ by bin/curate/props_ops_reference.py) -- editing a
# schema must rebuild the PDF, exactly as editing a tutorials part does.
propsGuide.pdf: propsGuide-operations.tex

# Every guide depends on the GENERATED version stamp -- a version bump must
# rebuild all four PDFs, or they keep claiming the previous release.
$(PDFS) tutorialsGuide.pdf: version.tex

%.pdf: %.tex preamble.tex version.tex cc-by-sa-4.0.txt
	@echo "  pdflatex (pass 1)  $<"
	@$(LATEX) $(LATEXFLAGS) $< > $*.build.log 2>&1 || \
	    (echo "  FAIL --- see $*.build.log"; tail -40 $*.build.log; exit 1)
	@echo "  pdflatex (pass 2)  $<"
	@$(LATEX) $(LATEXFLAGS) $< > $*.build.log 2>&1 || \
	    (echo "  FAIL --- see $*.build.log"; tail -40 $*.build.log; exit 1)
	@echo "  built  $@"

clean:
	rm -f *.aux *.log *.toc *.out *.build.log

distclean: clean
	rm -f $(PDFS)
