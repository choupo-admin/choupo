# paper/whitepaper/Makefile -- build the white paper PDF (DEV.md 4c C126).
# `make` builds whitepaper.pdf; `make clean` removes the LaTeX by-products.
# The DRAFT watermark is the \\drafttrue switch at the top of whitepaper.tex.

whitepaper.pdf: whitepaper.tex whitepaper.bib ../paper.bib
	pdflatex -interaction=nonstopmode -halt-on-error whitepaper
	bibtex whitepaper
	pdflatex -interaction=nonstopmode -halt-on-error whitepaper
	pdflatex -interaction=nonstopmode -halt-on-error whitepaper

clean:
	rm -f whitepaper.aux whitepaper.bbl whitepaper.blg whitepaper.log whitepaper.out

.PHONY: clean
