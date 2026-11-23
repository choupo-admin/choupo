# steam01_if97_verification

Evaluates every IAPWS R7-97(2012) computer-program verification value this slice
covers (Tables 5, 15, 35, 36) and shows them beside the release's own numbers.

Where the reference values come from: this case's own `expected` file, whose
values were copied digit for digit from IAPWS R7-97(2012) Tables 5, 15, 35 and 36.
`bin/curate/steam01_reference_csv.py` writes them, without retyping, to
`constant/reference/iapws_if97_verification.csv`.  They were NOT re-read from the
release document in the C480 slice that added the figures.
