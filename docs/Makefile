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

# The public guides.
DOCS        := userGuide developerGuide theoryGuide propsGuide
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
%.pdf: %.tex preamble.tex cc-by-sa-4.0.txt
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
