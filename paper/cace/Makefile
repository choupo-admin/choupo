# paper/cace/Makefile -- build the Computers & Chemical Engineering draft
# (DEV.md 4c C126).
#
#   make                    main.pdf and supplement.pdf (and graphical_abstract.pdf)
#   make check-highlights   each highlight <= 85 characters including spaces
#   make submission         a flat directory submission/ for the journal's
#                           upload (main.tex with local paths, refs.bib, the
#                           figures, the data, highlights.tex and the
#                           graphical abstract) -- a build product, NOT to be
#                           committed
#   make clean              remove the LaTeX by-products
#
# Needs pdflatex, bibtex and the elsarticle class (Debian/Ubuntu:
# `apt-get install texlive-publishers`, or elsarticle from CTAN), plus
# pgfplots, draftwatermark and lineno.  The DRAFT watermark and the line
# numbers are the \drafttrue switch at the top of main.tex.
#
# The run outputs the figures are drawn from have ONE home each: the curation
# run's in the white paper's folder (../whitepaper/data/*.csv,
# ../whitepaper/figures/*.png), and the nanofiltration data revision 2 added in
# data/*.csv, each file written by a generator in figures/ (gen_dspmde_fit.py,
# gen_sdem_traces.py; supplement.tex S1).

WP := ../whitepaper

all: main.pdf supplement.pdf

main.pdf: main.tex highlights.tex refs.bib figures/architecture.tex \
          graphical_abstract.pdf $(wildcard $(WP)/data/*.csv) \
          $(wildcard data/*.csv) $(wildcard $(WP)/figures/*.png)
	pdflatex -interaction=nonstopmode -halt-on-error main
	bibtex main
	pdflatex -interaction=nonstopmode -halt-on-error main
	pdflatex -interaction=nonstopmode -halt-on-error main

supplement.pdf: supplement.tex $(wildcard $(WP)/figures/*.png)
	pdflatex -interaction=nonstopmode -halt-on-error supplement
	pdflatex -interaction=nonstopmode -halt-on-error supplement

graphical_abstract.pdf: graphical_abstract.tex figures/architecture.tex \
                        $(WP)/figures/gui_flowsheet.png
	pdflatex -interaction=nonstopmode -halt-on-error graphical_abstract

check-highlights:
	@grep '^\\item' highlights.tex | sed 's/^\\item //' | \
	  awk '{ n = length($$0); printf "%3d  %s\n", n, $$0; if (n > 85) bad = 1 } \
	       END { if (bad) { print "a highlight exceeds 85 characters"; exit 1 } }'

submission: main.pdf
	rm -rf submission && mkdir -p submission/figures submission/data
	cp highlights.tex refs.bib graphical_abstract.tex graphical_abstract.pdf \
	   supplement.tex submission/
	cp figures/architecture.tex $(WP)/figures/*.png submission/figures/
	cp $(WP)/data/*.csv data/*.csv submission/data/
	sed -e 's|{figures/}{../whitepaper/figures/}|{figures/}|' \
	    -e 's|\\newcommand{\\datadir}{../whitepaper/data}|\\newcommand{\\datadir}{data}|' \
	    main.tex > submission/main.tex

clean:
	rm -f main.aux main.bbl main.blg main.log main.out main.spl \
	      supplement.aux supplement.log supplement.out \
	      graphical_abstract.aux graphical_abstract.log
	rm -rf submission

.PHONY: all check-highlights submission clean
