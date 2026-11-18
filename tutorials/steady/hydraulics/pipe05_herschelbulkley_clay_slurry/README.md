# pipe05 -- a Herschel-Bulkley clay slurry in a pipe (Chhabra & Richardson Example 3.3)

The flow curve is the ROWS (log-log between them) with the yield stress, 17 Pa, a datum of its own
(R8: never read off a fit).  The wall stress comes from the table, not from the closed form:
tau_w = 29.336 Pa (book 29.31), phi = tau_0/tau_w = 0.5795 (0.58), -dP = 1.467 MPa (1.46 MPa),
plug radius 11.59 mm (11.6 mm), plug velocity 0.619 m/s (0.62 m/s).

Run: `runCase tutorials/steady/hydraulics/pipe05_herschelbulkley_clay_slurry`.
