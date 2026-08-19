# Rules that exist and are NOT shipped as records

Each entry names a rule this project believes to be real, states what is missing,
and says what would close it.  The list is the work-list; it is not an apology.

## 1. The reflux-drum level threshold ("hold the level with reflux when R is large")

`docs/designGuide.tex` states the rule in its general form and Choupo ships it as
`columnControl-levelOnLargerLeavingStream.dat` under `authority
choupoDesignGuide` — *control a level with the LARGER stream leaving that drum*.

What is NOT shipped is the **numeric threshold**.  A literature search returns
the same rule with at least three different thresholds — reflux ratio above
about 2, above 3, and the "4 to 5" that circulates in course notes — attributed
to overlapping sources, and none of them could be pinned to a page in a copy
that was opened.  Writing one of those numbers into a record would make Choupo
the authority for a threshold it cannot defend.

*To close it:* one checked page in a primary source stating a threshold, cited
as that source's threshold rather than as the rule's.

## 2. Moore's singular-value-decomposition criterion for the sensor tray

Luyben (2006) compares five criteria and concludes that the SVD criterion is a
simple and effective method — so the criterion this project's tool does **not**
compute is the one that paper prefers.  The criterion itself is due to Moore,
in a chapter of *Practical Distillation Control* (W. L. Luyben, ed., Van
Nostrand Reinhold, 1992).

Not shipped as a record because the chapter number and page range could not be
verified, and a record is the surface where an unverified page would look
authoritative.  The **consequence** is shipped instead, inside
`columnControl-fiveCriteriaCompared.dat`, whose source is Luyben (2006) and which
says in the paper's own terms that the tool's two criteria are not that paper's
recommendation.

*To close it:* the chapter's opening page from a checked copy — and, separately,
an engine surface that publishes the steady-state gain matrix from which an SVD
could be taken (see §3).

## 3. Shinskey's configuration selection by steady-state relative gain

The 1990 AIChE paper Choupo cites (`columnControl-steadyStateRgaMisleads.dat`,
`columnControl-ratioBestForTwoPoint.dat`) is an argument *about* a selection
method that is widely attributed to Shinskey's *Distillation Control* (2nd ed.,
McGraw-Hill, 1984).  Choupo cites the counter-argument, which it can source, and
does **not** ship Shinskey's own rule as a record: no page of that book was
opened, and quoting a rule from the paper that disputes it would be citing a
critic as the author.

*To close it:* a checked page in Shinskey.  Until then the tool shows the
counter-argument attributed to the people who made it, and names the position it
argues against without putting words in that position's mouth.

## 4. The relative-gain array of the reader's own column

The heuristics above are *about* relative gains, and Choupo cannot compute one:
the steady-state gain matrix needs each candidate manipulated variable perturbed
against each controlled composition, and nothing publishes it.  What the engine
DOES publish per stage is temperature and composition, which is what the tray
diagnostic uses.

*To close it:* an engine slice, not a tool slice.
