/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  Intellectual property as competitive strategy, as DATA (commission C140,
  2026-10-24; dispatched 2026-10-26).  Vitor: "as formas e estrategias como
  as empresas gerem a propriedade intelectual e como lutam com os
  concorrentes ... A competicao e feita sempre em modo de guerra e os alunos
  nao sabem isso.  Depois ha a questao de decidir o que vale a pena
  patentear e o que e melhor guardar como segredo industrial."

  THIS IS LAW AND HISTORY, AND A WRONG CLAIM TAUGHT TO A STUDENT IS THE
  FAILURE THIS FILE IS WRITTEN AGAINST.  Every legal statement carries the
  article, rule, decision or section it was checked against, and every one
  of those was READ, online, on 2026-10-26 -- the list, with what was read
  in each, is IP_SOURCES below and is drawn on the page.  A statement that
  could not be checked against a primary text was REMOVED, or says on the
  page that it varies by jurisdiction or was not verified.  Three examples
  of what was removed, so a later editor does not put them back from
  memory: the amount of Whittle's lapsed renewal fee and who declined to pay
  it; the outcome of the AstraZeneca appeal to the Court of Justice (only
  the General Court's 2010 judgment was read); and any statistic on how
  often decoy filings are made (no source this page could check records
  one).

  NO REAL COMPANY IS ACCUSED OF ANYTHING EXCEPT THROUGH A CITED DECISION OR
  OFFICIAL RECORD, and the historical cases are presented as CONTESTED where
  the scholarship contests them (the aircraft pool, Watt's patent).  Every
  other company on the page is fictitious and says so.

  NOT LEGAL ADVICE, and the page says so at its top and in its limits.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const IP_NOT_ADVICE = "This page teaches how intellectual property "
  + "is used in competition so that you can recognise it.  It is not legal "
  + "advice: the law differs between countries and changes, and a real "
  + "decision about a real invention needs a qualified patent attorney or "
  + "lawyer for the countries that matter.";

export const IP_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Competition is fought with information",
    body: "Students often meet competition as a technical race: the better "
      + "process wins.  Firms meet it as a contest over information, and "
      + "intellectual property is one of its weapons.  A large survey of "
      + "1,478 US manufacturing R&D labs found that firms protect the "
      + "profits of invention with patents, secrecy, lead time and "
      + "complementary manufacturing and marketing, and that patents were "
      + "the LEAST emphasised of these in most industries, secrecy and lead "
      + "time the most.  Where firms did patent, a large part of the reason "
      + "was not to use the invention but to block: in discrete-product "
      + "industries such as chemicals, to block rivals' substitutes; in "
      + "complex-product industries, to force rivals into negotiation; and "
      + "to prevent suits (Cohen, Nelson and Walsh, NBER WP 7552, 2000).  "
      + "Two facts make it a contest of reading.  A European patent "
      + "application is published 18 months after its filing or priority "
      + "date (EPC Art. 93(1)), and an international application likewise "
      + "(PCT Art. 21(2)(a)): whatever you file, your competitors will read, "
      + "and what they file, you can read.  Everything on this page follows "
      + "from that.",
  },
  {
    n: 2,
    title: "What a patent buys, and what it costs",
    body: "A patent is a bargain with the public.  You disclose the "
      + "invention fully enough for a skilled person to carry it out (EPC "
      + "Art. 83), and in exchange you get the right to exclude others for "
      + "20 years from the date of filing (EPC Art. 63(1); TRIPS Art. 33 "
      + "sets 20 years from filing as the minimum).  To be granted, an "
      + "invention must be new, involve an inventive step and be "
      + "susceptible of industrial application (EPC Art. 52(1)): new means "
      + "not part of the state of the art, which is everything made "
      + "available to the public in any way before the filing date (Art. "
      + "54(1)-(2)); inventive means not obvious to a person skilled in the "
      + "art (Art. 56).  The rights start when the grant is published "
      + "(Art. 64(1)); for a process patent they extend to the products "
      + "directly obtained by the process (Art. 64(2)); and infringement is "
      + "decided under each country's national law (Art. 64(3)).  The costs "
      + "are three.  The disclosure is permanent: when the patent ends, or "
      + "if it is refused after publication, the teaching stays public.  "
      + "The money: filing, translation and yearly renewal fees in every "
      + "country you want covered, which this page does not quantify "
      + "because fees change and differ.  And enforcement: a patent is a "
      + "right to sue, worth what you can detect and afford to enforce.",
  },
  {
    n: 3,
    title: "What a trade secret is, in law",
    body: "In the European Union a trade secret is information that meets "
      + "three conditions together: it is secret, 'not ... generally known "
      + "among or readily accessible to persons within the circles that "
      + "normally deal with the kind of information in question', 'as a body "
      + "or in the precise configuration and assembly of its components'; it "
      + "has commercial value because it is secret; and it 'has been subject "
      + "to reasonable steps under the circumstances ... to keep it secret' "
      + "(Directive (EU) 2016/943, Art. 2(1); in Portugal, Código da "
      + "Propriedade Industrial, CPI Art. 313).  The third condition is the "
      + "one firms lose: need-to-know access, confidentiality agreements and "
      + "access control are what 'reasonable steps' looks like in practice, "
      + "and without them there is no secret to protect.  The law forbids "
      + "taking a secret by unauthorised access or copying, using it in "
      + "breach of a confidentiality agreement, or using one you knew or "
      + "ought to have known was taken unlawfully (Art. 4).  It ALLOWS "
      + "independent discovery and the 'observation, study, disassembly or "
      + "testing of a product' that was made available to the public or is "
      + "lawfully in your possession, unless you are under a valid duty not "
      + "to (Art. 3(1)(a)-(b); CPI Art. 315) -- so reverse engineering of a "
      + "product you sell is lawful for whoever buys it, unless a contract "
      + "binds them.  And it does not stop people leaving: nothing in the "
      + "directive restricts employees' use of 'experience and skills "
      + "honestly acquired in the normal course of their employment' (Art. "
      + "1(3)(b)).  A secret lasts as long as it holds, with no term -- and "
      + "no protection at all against someone who finds it independently.",
  },
  {
    n: 4,
    title: "Patent or secret: the questions that decide",
    body: "Five questions, asked of each invention.  (1) Can it be reverse-"
      + "engineered from what you sell?  If the product reveals it, a secret "
      + "will not hold, and worse: once a product is on the market it is "
      + "part of the state of the art (G 1/92; G 1/23, 2025, holds that a "
      + "marketed product is not excluded from the state of the art merely "
      + "because its composition could not be reproduced), so selling first "
      + "and filing later can destroy your own novelty.  (2) Can "
      + "infringement be DETECTED?  A product on the market can be bought "
      + "and analysed; a process run inside someone else's plant usually "
      + "cannot be seen.  The law helps only part of the way: for a process "
      + "that makes a NEW product, an identical product is presumed made by "
      + "the patented process unless proven otherwise (TRIPS Art. 34; CPI "
      + "Art. 99) -- for a process that makes a known product, no such help.  "
      + "(3) How long is the useful life against the 20-year term?  An "
      + "advantage that will be obsolete in five years gains little from "
      + "twenty years of exclusion and loses its secrecy for nothing; one "
      + "that will last decades outlives the patent, after which the "
      + "disclosure hands it to everyone.  (4) What does filing cost across "
      + "the markets that matter, and in which of them could you enforce?  "
      + "(5) Can the secret survive staff turnover?  Know-how walks out with "
      + "the people who carry it (step 3), so a secret held by many is "
      + "weaker than one held by few.",
  },
  {
    n: 5,
    title: "A catalyst recipe and a new molecule land on opposite sides",
    body: "Apply the five questions to two inventions.  A CATALYST RECIPE "
      + "and its activation procedure, used in your own plant to make a "
      + "commodity product: the product is the same as everyone else's, so "
      + "it reveals nothing; a competitor using the recipe in its own plant "
      + "cannot be seen; the product is not new, so no presumption helps "
      + "you; and a patent would publish the recipe at 18 months to the very "
      + "people you cannot police.  It lands on SECRET -- provided you take "
      + "the reasonable steps, keep dated records (step 8), and accept that "
      + "a rival may find it independently.  A NEW MOLECULE you sell: the "
      + "first customer can analyse it; the moment it is on the market it "
      + "is prior art, against you too; infringement is visible on any "
      + "shelf; and its useful life often matches the term.  It lands on "
      + "PATENT, filed before the product is shown to anyone.  The point is "
      + "not the answer but the questions: change one fact -- a catalyst "
      + "that is sold, as a product, to other plants -- and the catalyst "
      + "moves toward the patent side, because now it is in a customer's "
      + "hands to be analysed.",
  },
  {
    n: 6,
    title: "Timing: the clock every filing starts",
    body: "A first filing starts a clock that every later move is measured "
      + "against.  For twelve months you may file in other countries and "
      + "claim the first filing's date as your priority (EPC Art. 87(1); "
      + "Paris Convention members and WTO members), so the priority year is "
      + "a year to decide where the invention is worth protecting.  At 18 "
      + "months the application is published (EPC Art. 93(1); PCT Art. "
      + "21(2)(a)) and your competitors read it.  An international (PCT) "
      + "application defers the national filings, with their translations "
      + "and fees, to 30 months from the priority date (PCT Art. 22(1); "
      + "national law may allow longer, Art. 22(3)) -- 31 months for entry "
      + "at the European Patent Office (EPC Rule 159(1)) -- which buys time "
      + "to learn whether the invention is worth the cost before paying it.  "
      + "A divisional application may be filed while an earlier European "
      + "application is pending, keeps the earlier filing date (EPC Art. "
      + "76(1); Rule 36(1)), and so keeps claims open after competitors have "
      + "shown their hand.  The term runs from the filing date, not the "
      + "grant: the exclusive period you actually enjoy is the time between "
      + "grant and expiry, cut short again if the invention's commercial "
      + "life ends first.",
    formula: String.raw`\begin{aligned}
t_\mathrm{prio} &= t_1 + 12\ \text{months} &&\text{(last day to claim priority)}\\
t_\mathrm{pub} &= t_1 + 18\ \text{months} &&\text{(publication: competitors read it)}\\
t_\mathrm{PCT} &= t_1 + 30\ \text{months} &&\text{(national phase; 31 at the EPO)}\\
t_\mathrm{exp} &= t_\mathrm{f} + 20\ \text{years} &&\text{(end of the term)}\\
\Delta t_\mathrm{excl} &= \min\left(t_\mathrm{exp},\ t_\mathrm{end}\right) - t_\mathrm{g} &&\text{(exclusion you actually use)}
\end{aligned}`,
    where: [
      { sym: "t_\\mathrm{prio}", means: "the end of the priority year: the "
        + "last date to file elsewhere claiming the first filing's date "
        + "(EPC Art. 87(1))" },
      { sym: "t_1", means: "the date of the first filing (the priority "
        + "date)" },
      { sym: "t_\\mathrm{pub}", means: "the date the application is "
        + "published (EPC Art. 93(1); PCT Art. 21(2)(a))" },
      { sym: "t_\\mathrm{PCT}", means: "the time limit to enter the national "
        + "phase of a PCT application (PCT Art. 22(1)); the EPO allows 31 "
        + "months (EPC Rule 159(1))" },
      { sym: "t_\\mathrm{exp}", means: "the date the patent expires" },
      { sym: "t_\\mathrm{f}", means: "the filing date of the application "
        + "the patent was granted on (EPC Art. 63(1))" },
      { sym: "\\Delta t_\\mathrm{excl}", means: "the period of exclusion "
        + "you can actually use" },
      { sym: "t_\\mathrm{end}", means: "the end of the invention's "
        + "commercial life -- your own estimate" },
      { sym: "t_\\mathrm{g}", means: "the date the mention of grant is "
        + "published, from which the rights run (EPC Art. 64(1))" },
    ],
    note: "The calculator below applies these periods to a date you choose.  "
      + "It is calendar arithmetic, not a docketing tool: real deadlines "
      + "have rules for holidays, extensions and lost rights that are not "
      + "modelled here.",
  },
  {
    n: 7,
    title: "Defensive publication: destroying novelty, not proving priority",
    body: "A common belief is that a firm publishes an idea in an obscure "
      + "journal 'so that if someone patents it, it can prove it had it "
      + "first'.  That is not how it works in Europe.  The state of the art "
      + "is everything made available to the public, by written or oral "
      + "description, by use or in any other way, before the filing date "
      + "(EPC Art. 54(2)); Portugal's Code says the same, 'dentro ou fora do "
      + "País' -- inside or outside the country (CPI Art. 55(1)).  There is "
      + "no limit of place or language.  So a publication does not give its "
      + "author any right; it makes the idea UNPATENTABLE FOR EVERYONE, the "
      + "author included.  An obscure journal serves because what counts is "
      + "that the public COULD have had access: the theoretical possibility "
      + "of access is enough, and it is irrelevant whether anyone actually "
      + "read it (Case Law of the Boards of Appeal I.C.3.1, citing T 444/88 "
      + "and T 381/87).  Venues exist for this purpose; Research Disclosure "
      + "describes itself as a defensive publication service that "
      + "establishes an invention as prior art.  The catches: the secret "
      + "ends the day it is published, competitors may use the idea freely, "
      + "and you lose your own right to patent it -- the EPC disregards an "
      + "earlier disclosure only in two narrow cases, an evident abuse in "
      + "relation to the applicant and display at an officially recognised "
      + "international exhibition, within six months before filing (Art. "
      + "55(1)).  The United States is "
      + "different: an inventor's own disclosure up to one year before "
      + "filing is not prior art against that inventor (35 USC 102(b)(1)).  "
      + "Grace periods vary by jurisdiction.",
  },
  {
    n: 8,
    title: "Keeping the secret and staying safe: prior use and dated evidence",
    body: "The fear behind keeping a process secret is that a rival "
      + "discovers it independently, patents it, and then forbids you to "
      + "use your own process.  Some countries answer that fear with a "
      + "PRIOR-USER RIGHT.  In Portugal, a patent cannot be enforced against "
      + "someone who, in good faith and by their own means, already knew the "
      + "invention and was using it, or making 'effective and serious "
      + "preparations' to use it, in the national territory before the "
      + "patent's filing or priority date (CPI Art. 105(1)).  The catches "
      + "are in the same article: it does not apply if the knowledge came "
      + "from unlawful acts against the patent owner (105(2)); the burden of "
      + "proof is on whoever invokes it (105(3)); it lets you continue only "
      + "to the extent of your earlier knowledge, for your own business, and "
      + "it can be transferred only together with that business (105(5)); "
      + "and it is national -- it protects your Portuguese plant, not your "
      + "plant abroad.  Other laws differ: the United States has a prior-"
      + "commercial-use defence that requires commercial use at least one "
      + "year before the patent's effective filing date (35 USC 273(a)).  "
      + "Prior-user rights vary by jurisdiction, and the European Patent "
      + "Convention leaves infringement to national law (Art. 64(3)).  "
      + "Because the burden is yours, the EVIDENCE is the asset: dated "
      + "records made at the time.  France's INPI offers the e-Soleau, a "
      + "deposit that proves a document existed on a date, kept for five "
      + "years and extendable -- evidence of a date, not an intellectual "
      + "property right (INPI); the Benelux office offers a similar "
      + "dated deposit, the i-DEPOT.  Signed and witnessed laboratory "
      + "notebooks and trusted timestamps serve the same purpose.  The "
      + "catch: a dated document proves the date of a document, not that "
      + "you were USING the invention, which is what the Portuguese right "
      + "requires.  A further tactic is to SPLIT the know-how: supply a "
      + "catalyst as a black box, or divide a process among suppliers so "
      + "that no one sees the whole.  The law fits it: a secret can lie in "
      + "the 'precise configuration and assembly of its components' (Directive "
      + "Art. 2(1)(a)).  The catch: every partner who holds a piece must "
      + "itself be bound and must take its own reasonable steps.",
  },
  {
    n: 9,
    title: "Patents as weapons: blocking, fencing, thickets and decoys",
    body: "Once filings are read, a patent is also a move in a game.  "
      + "BLOCKING and FENCING: patenting not only your chosen route but the "
      + "nearby alternatives, so a rival cannot design around you -- the "
      + "survey of step 1 found this is how firms in discrete-product "
      + "industries such as chemicals use patents, 'to block the development "
      + "of substitutes'.  The catch: every fence post is paid for in every "
      + "country, and each one publishes what you know.  THICKETS: a dense "
      + "web of overlapping rights that anyone must license from several "
      + "owners before making a product (Shapiro, 2001).  The catch: a "
      + "thicket also traps its owners, who then need each other's licences "
      + "(step 12).  DECOYS: an application is published at 18 months "
      + "whether or not its owner pursues it (EPC Art. 93), so a filing on "
      + "a route the filer has already abandoned can send a careful reader "
      + "the wrong way.  How often this is done is not recorded in any "
      + "source this page could check; treat it as a possibility every "
      + "reader of filings must allow for, not as a documented practice of "
      + "any firm.  The catch: the decoy is published prior art too, and it "
      + "can be read for what it reveals about what the filer was "
      + "exploring.  The counter to all three is the same: read the claims, "
      + "check their legal status, and ask what the filer would gain if you "
      + "believed them (step 11).",
  },
  {
    n: 10,
    title: "Keeping a family alive: divisionals, continuations, evergreening, utility models",
    body: "DIVISIONALS (Europe) and CONTINUATIONS (United States) let an "
      + "applicant file new claims on matter already disclosed, keeping the "
      + "earlier filing date: a European divisional may be filed while the "
      + "earlier application is pending (EPC Art. 76(1); Rule 36(1)), and a "
      + "US continuing application filed before the earlier one is patented "
      + "or abandoned has the earlier date (35 USC 120).  The effect is that "
      + "claims can still be shaped after competitors have launched.  The "
      + "catch: nothing new can be added -- a divisional may not extend "
      + "beyond the earlier application as filed (Art. 76(1)), and every "
      + "member costs fees.  EVERGREENING: later patents on new forms, "
      + "formulations or uses of a product whose first patent is expiring.  "
      + "The law permits some of this on its merits -- for example a known "
      + "substance may be patented for a new medical use (EPC Art. 54(4)-"
      + "(5)), and some countries extend protection for products that "
      + "needed a marketing authorisation (Art. 63(2)(b)).  The catch: each "
      + "later patent must itself be new and inventive and covers only what "
      + "it claims; the original product falls free when the first patent "
      + "expires.  UTILITY MODELS: a cheaper, faster right for 'minor' "
      + "inventions, generally with a lower inventive step, simpler "
      + "procedures and a shorter term, whose requirements and duration "
      + "vary from country to country (WIPO).  In Portugal "
      + "a utility model lasts six years, extendable twice by two years to "
      + "at most ten (CPI Art. 142), and it may claim an inventive step on a "
      + "'practical or technical advantage' alone (Art. 122(2)(b)) -- but a "
      + "chemical engineer should read the exclusions first: it is NOT "
      + "available for chemical substances or compositions as such, chemical "
      + "processes, pharmaceutical substances and processes, or food products "
      + "and their processes (Art. 121(1)(c)-(e)).",
  },
  {
    n: 11,
    title: "Counter-moves: reading, observing, opposing",
    body: "FREEDOM TO OPERATE.  Before launching a product or a process, "
      + "search for patents and applications that may cover it and are "
      + "still in force; such a search is country-specific and needs an "
      + "analysis of claims and legal status (WIPO, PATENTSCOPE glossary).  "
      + "THIRD-PARTY OBSERVATIONS.  After an application is published, any "
      + "third party may send the European Patent Office observations on "
      + "its patentability -- prior art the examiner missed, or reasons the "
      + "disclosure is insufficient -- without becoming a party (EPC Art. "
      + "115), and may do so anonymously (Guidelines E-VI 3).  OPPOSITION.  "
      + "Within nine months of the mention of grant, ANY person may oppose "
      + "a European patent (Art. 99(1)) on the grounds of Art. 100: not "
      + "patentable (novelty, inventive step), insufficiently disclosed, or "
      + "amended beyond the application as filed.  One opposition applies "
      + "to the patent in all the states where it has effect (Art. 99(2)), "
      + "and ends in revocation, rejection, or maintenance as amended (Art. "
      + "101).  The opponent need not be the interested company: a 'straw "
      + "man' acting for someone else is admissible, short of abuse of "
      + "process (G 3/97 and G 4/97).  After the nine months the attack is "
      + "national, one country at a time (Art. 138), or before the Unified "
      + "Patent Court in the states that take part, Portugal among them "
      + "(EPO).  The catch of every counter-move: it tells the patentee you "
      + "care, and an opposition lets the patentee amend into a narrower "
      + "patent that has now survived a challenge (Art. 101(3)).",
  },
  {
    n: 12,
    title: "Armed peace: cross-licences, pools, standards and the assertion business",
    body: "Firms that block each other usually settle.  A CROSS-LICENCE "
      + "lets each use the other's patents; a PATENT POOL gathers many "
      + "owners' patents into one package licence.  Both help firms through "
      + "a thicket, at the cost of transactions, and both meet competition "
      + "law, which is wary of cooperation between rivals -- package "
      + "licensing suits complementary patents, not substitutes (Shapiro, "
      + "2001).  A STANDARD-ESSENTIAL PATENT is one every maker of a "
      + "standard-compliant product must use.  Where its owner has given "
      + "the standards body an irrevocable undertaking to license on fair, "
      + "reasonable and non-discriminatory (FRAND) terms, the Court of "
      + "Justice held that seeking an injunction against an "
      + "alleged infringer can then abuse a dominant position unless the "
      + "owner first follows a set procedure, including a specific licence "
      + "offer (Huawei v ZTE, C-170/13, 2015).  PATENT ASSERTION ENTITIES "
      + "acquire patents from others and earn revenue by asserting them "
      + "against makers of products; the US Federal Trade Commission's 2016 "
      + "study distinguished portfolio PAEs, which license broadly, from "
      + "litigation PAEs, which typically sue first (FTC, 2016).  The "
      + "catch for a manufacturer: an entity that makes nothing infringes "
      + "none of your patents, so it cannot be counter-sued and a "
      + "cross-licence offers it nothing it needs.",
  },
  {
    n: 13,
    title: "Who owns what an employee invents",
    body: "Before you choose between patent and secret, know whose choice "
      + "it is.  The EPC leaves the right to a patent for an employee's "
      + "invention to the law of the state where the employee is mainly "
      + "employed (Art. 60(1)).  In Portugal, an invention made in executing "
      + "an employment contract that foresees inventive activity belongs to "
      + "the employer; if that activity was not specially paid, the "
      + "inventor is owed remuneration in line with the invention's "
      + "importance (CPI Art. 58(1)-(2)).  Even outside that case, if the "
      + "invention falls within the firm's activity, the firm has an option "
      + "on it against remuneration, the inventor must inform the firm "
      + "within three months, and the firm has three months to exercise "
      + "the option (Art. 58(3)).  An invention for which a patent is "
      + "applied in the year after the inventor leaves is deemed made during "
      + "the employment (Art. 58(5)), and the inventor's rights cannot be "
      + "waived in advance (Art. 58(9)).  Rules differ elsewhere; read your "
      + "own contract and your country's law.",
  },
  {
    n: 14,
    title: "The limits: where strategy becomes unlawful",
    body: "Everything above is lawful when done honestly.  These are the "
      + "lines, stated so that you can recognise them, not as a manual.  "
      + "SHAM LITIGATION.  In US antitrust law, a lawsuit loses its immunity "
      + "as a 'sham' if it is objectively baseless -- no reasonable litigant "
      + "could realistically expect success on the merits -- AND it conceals "
      + "an attempt to use the process itself, rather than its outcome, as "
      + "an anticompetitive weapon (Professional Real Estate Investors v. "
      + "Columbia Pictures, 508 U.S. 49, 1993).  ABUSE OF A DOMINANT "
      + "POSITION.  In the EU, the General Court upheld the Commission's "
      + "finding that a dominant firm abused its position by making "
      + "misleading representations to national patent offices to obtain "
      + "extended protection it was not entitled to (AstraZeneca v "
      + "Commission, T-321/05, 2010); and seeking an injunction on a "
      + "standard-essential patent without the FRAND procedure can be an "
      + "abuse (Huawei v ZTE, step 12).  INEQUITABLE CONDUCT.  In the United "
      + "States, a patent can be held unenforceable if the applicant, with "
      + "specific intent to deceive the patent office, withheld information "
      + "that was 'but-for' material to the grant (Therasense v. Becton, "
      + "Dickinson, 649 F.3d 1276, Fed. Cir. 2011, en banc).  "
      + "MISAPPROPRIATION OF TRADE SECRETS.  Acquiring a rival's secret by "
      + "unauthorised access or copying, using it in breach of a "
      + "confidentiality agreement, or using one you knew or ought to have "
      + "known was taken unlawfully is unlawful (Directive 2016/943 Art. 4; "
      + "CPI Art. 314) -- hiring a rival's engineer is lawful, having them "
      + "bring the rival's files is not.  The tests, sanctions and remedies "
      + "vary by jurisdiction.",
  },
  {
    n: 15,
    title: "Worked case: the process patent whose recipe does not work",
    body: "The question: a patent protects a PROCESS; you follow its recipe "
      + "and it does not work.  Can you have the patent invalidated?  "
      + "THE GROUND is insufficiency of disclosure.  The patent must "
      + "disclose the invention clearly and completely enough for a skilled "
      + "person to carry it out (EPC Art. 83); that is a ground of opposition "
      + "(Art. 100(b)) and of national revocation (Art. 138(1)(b)).  "
      + "Portugal's Code has the same requirement (CPI Art. 66) and makes a "
      + "patent null when its object is not described so that a skilled "
      + "person can execute it (Art. 114(d)).  "
      + "WHO MAY ACT, AND WHEN.  Before grant, once the application is "
      + "published, anyone may file third-party observations (Art. 115), "
      + "anonymously if they wish (Guidelines E-VI 3).  Within nine months "
      + "of the mention of "
      + "grant, any person may oppose; one decision covers every state "
      + "where the patent has effect (Art. 99).  After that, national "
      + "proceedings: in Portugal the nullity of a patent can only be "
      + "declared by a court (CPI Art. 34(1)), the Tribunal da Propriedade "
      + "Intelectual (Lei 62/2013, Art. 111(1)(d)), and any interested "
      + "party may invoke it at any time (CPI Art. 32(2)); or the Unified "
      + "Patent Court, where it has jurisdiction.  "
      + "THE BURDEN OF PROOF.  A granted patent is presumed to meet the "
      + "requirements (T 1076/21).  The objector must show, on the balance "
      + "of probabilities, that the skilled person, reading the patent with "
      + "the common general knowledge, could not carry out the invention "
      + "(T 182/89): serious doubts, substantiated by verifiable facts "
      + "(T 19/90).  A bare statement that one example was repeated once "
      + "'exactly as described' without giving exactly the claimed results "
      + "was held inadequate in principle (T 406/91).  So the evidence is a "
      + "reproducible experimental report that follows the patent's "
      + "teaching faithfully, filling any gap only as the skilled person "
      + "would from common general knowledge (Guidelines F-III 1); if such "
      + "experiments suggest the claimed result is not achieved, the burden "
      + "can shift to the proprietor (Guidelines F-III 4).  "
      + "WHAT MUST FAIL is what the CLAIMS require.  When a technical "
      + "effect is itself a feature of the claim, whether it is achieved is "
      + "a question of sufficiency: the Enlarged Board said so of a "
      + "therapeutic effect in a medical-use claim (G 2/21, Reasons 74), "
      + "and a claimed minimum yield or purity is, on this page's reading, "
      + "the same kind of feature.  Where "
      + "the yield is only promised in the description, the process as "
      + "claimed may still be carried out, and the attack moves to "
      + "inventive step: claims covering embodiments that do not achieve "
      + "the purported effect are objected to there (Guidelines F-IV 4.22, "
      + "G-VII 5.2), and the proprietor may rely on an effect only if the "
      + "skilled person, with the common general knowledge and the "
      + "application as filed, would derive it as encompassed by the "
      + "technical teaching and embodied by the same invention (G 2/21, "
      + "headnote II).  If only part of the claims fails, the patent is "
      + "limited, not revoked (EPC Art. 101(3), 138(2)-(3); CPI Art. 115).  "
      + "THE PRACTICAL POINT, this page's reading rather than a rule: a "
      + "process patent that does not work rarely stops anyone from "
      + "operating, but it still deters (someone must assess it), it still "
      + "misleads a reader (step 9), and a challenge costs money.  So it is "
      + "usually attacked when it bites -- in opposition while the nine "
      + "months are open, or when its owner asserts it; how a validity "
      + "challenge joins an infringement case varies by jurisdiction.",
  },
  {
    n: 16,
    title: "Worked case: the turbine whose blades melt",
    body: "Imagine a patent on an aircraft gas turbine.  Built as described, "
      + "its blades melt.  Another firm adds cooled blades and the turbine "
      + "works.  Does the first patent survive?  "
      + "(1) The office does not build the invention.  It examines on paper "
      + "-- novelty, inventive step, industrial application, disclosure -- "
      + "so a patent that does not work in practice can be granted, and "
      + "once granted it is presumed valid until challenged (T 1076/21).  "
      + "(2) It is open to revocation for insufficiency (step 15), but the "
      + "test is whether the SKILLED PERSON could carry it out, and that "
      + "person brings the common general knowledge; the description need "
      + "not give 'well-known ancillary features' (Guidelines F-III 1).  If "
      + "the missing piece is common general knowledge, the skilled person "
      + "fills the gap and the disclosure is sufficient; it fails only if "
      + "making it work needs a research programme or an invention of its "
      + "own (Guidelines F-III 3).  Is blade cooling common general "
      + "knowledge?  NACA was testing air-cooled turbine blades in a "
      + "turbojet engine by 1950 (RM E50I04 and its series, research "
      + "memoranda classified at the time and public now), and by 1975 "
      + "turbine cooling was a chapter of NASA's course text on turbine "
      + "design (SP-290, volume 3).  Common general knowledge is normally "
      + "shown from textbooks rather than research papers or patents (Case "
      + "Law II.C.4.1), so the proprietor defending the patent would show "
      + "it that way -- and for a turbine filed today it can be shown: THE "
      + "ORIGINAL PATENT PROBABLY SURVIVES this attack.  That is the "
      + "decisive point.  "
      + "(3) The improver may patent the cooled-blade turbine if it is new "
      + "and inventive.  The two patents then BLOCK each other.  The "
      + "improver's turbine still has every feature of the first claim, and "
      + "a claim worded 'comprising' is read as not excluding further "
      + "features (Guidelines F-IV 4.20; infringement itself is decided "
      + "under national law, Art. 64(3)), so adding cooling does not escape "
      + "it; and the first owner cannot use the cooling without the "
      + "improver's licence.  (4) The normal way out is a CROSS-LICENCE.  "
      + "Failing agreement, the law provides a COMPULSORY LICENCE for a "
      + "dependent patent: TRIPS Art. 31(l) allows it where the second "
      + "invention is 'an important technical advance of considerable "
      + "economic significance', gives the first owner a cross-licence on "
      + "reasonable terms, and ties the licence to the second patent.  "
      + "Portugal provides compulsory licences for dependence between "
      + "patents (CPI Art. 108(1)(b)), only after reasonable efforts to "
      + "obtain a contractual licence have failed (Art. 108(3)), with the "
      + "conditions and the reciprocal licence set out in Art. 110.",
  },
  {
    n: 17,
    title: "Worked case: Whittle's turbojet patent",
    body: "The turbine is not only a thought experiment.  Frank Whittle "
      + "applied for his first turbojet patent, British application "
      + "347,206, on 16 January 1930 (Whittle, 1945; Starr, 2019).  The "
      + "main argument against the gas turbine, in his own words, concerned "
      + "'the maximum temperatures permissible with materials available' "
      + "(Whittle, 1945).  He also recorded that he had allowed the patent "
      + "'to lapse "
      + "through failure to pay the renewal fee' by 1935 (Whittle, 1945).  "
      + "(The amount of the fee and who declined to pay it are often told; "
      + "this page could not verify them in a primary source and leaves "
      + "them out.)  Had he kept it, could a rival have had it revoked "
      + "because 'the turbine would melt'?  "
      + "SUFFICIENCY IS JUDGED AT THE FILING DATE: the invention must be "
      + "sufficiently disclosed as from the effective date of filing, to a "
      + "skilled person with that date's common general knowledge (Case Law "
      + "II.C.4.1, stated for the EPC).  So the question is about 1930.  "
      + "'IMPOSSIBLE' IS FALSE: Whittle's experimental engine ran under its "
      + "own power from 12 April 1937 (Whittle, 1945); the Gloster-Whittle "
      + "E.28/39 made its first official flight on 15 May 1941 (Science "
      + "Museum Group); and the production turbojet NACA modified for its "
      + "1950 tests ran on uncooled turbine blades, two of which were "
      + "replaced by air-cooled ones for the experiment (RM E50I04).  The "
      + "principle worked without cooled blades, within what the materials "
      + "allowed.  THE REAL ATTACK would have been UNDUE BURDEN: more than a "
      + "decade lay between the filing and the flight.  AGAINST IT: a "
      + "patent must teach how to carry out the invention, not deliver an "
      + "optimised product -- a single example may suffice (Guidelines "
      + "F-III 1).  Where that line falls is the contested question, and "
      + "this page gives no verdict.  THE LAW THEN WAS NOT TODAY'S: the "
      + "Patents and Designs Act 1907 made available as revocation grounds "
      + "those of the old writ of scire facias and those of the Act itself "
      + "(s. 25(2)); the Patents Act 1949 listed inutility -- the invention "
      + "'is not useful' (s. 32(1)(g)) -- beside insufficient description "
      + "(s. 32(1)(h)); the Patents Act 1977 has no inutility ground "
      + "(s. 72(1)).  How a court of the 1930s would have applied the "
      + "grounds of its day to Whittle's patent, this page has not verified.",
  },
  {
    n: 18,
    title: "History: the Wright brothers, Curtiss and the 1917 pool; Watt and high-pressure steam",
    body: "THE WRIGHT BROTHERS.  Their US patent 821,393, filed 23 March "
      + "1903 and granted 22 May 1906 (Wright Co. v. Herring-Curtiss Co., "
      + "204 F. 597, W.D.N.Y. 1913), described wing warping for lateral "
      + "control.  Curtiss's machines used ailerons instead, and in the "
      + "account of the US Centennial of Flight Commission the courts "
      + "nevertheless found for the Wrights, the appeals court ordering "
      + "Curtiss to stop building aircraft with two ailerons moving "
      + "simultaneously in opposite directions (the appeal is reported at "
      + "211 F. 654, 2d Cir., 13 January 1914).  The litigation ended only "
      + "when, "
      + "with the war, the manufacturers formed the Manufacturers' Aircraft "
      + "Association and a patent pool with the government's approval, at "
      + "royalties of one percent.  That is the turbine case in history: a "
      + "broad first claim, an improver who escaped none of it, and a "
      + "dispute closed by pooling.  THE ACCOUNT IS CONTESTED.  Katznelson "
      + "and Howells (2015) argue that manufacturers faced no patent "
      + "barrier in the government-dominated market, that the 'hold-up' was "
      + "a story officials used to win condemnation powers, and that the "
      + "pool was imposed to depress royalties.  Read both before you cite "
      + "either.  WATT.  James Watt's 1769 steam-engine patent was extended "
      + "by Act of Parliament in 1775 to 1800; Boldrin and Levine (2008) "
      + "argue that it held back high-pressure steam until it expired.  "
      + "Selgin and Turner (2011) dispute it: high-pressure steam did come "
      + "after 1800, but for other reasons, including the belief that "
      + "high-pressure engines were too dangerous -- and Watt's monopoly may "
      + "have spurred Trevithick to invent around it.  The lesson is not "
      + "which side is right, but that 'a patent held back an industry' is "
      + "a claim about history that needs evidence like any other.",
  },
];

/** The deciding questions of step 4, as data the page tabulates. */
export interface DecisionQuestion { id: string; q: string; secretIf: string; patentIf: string; }

export const DECISION_QUESTIONS: readonly DecisionQuestion[] = [
  { id: "reverse", q: "Can it be reverse-engineered from what you sell?",
    secretIf: "No: nothing you sell reveals it",
    patentIf: "Yes: the first customer can analyse it, and a marketed "
      + "product is prior art" },
  { id: "detect", q: "Can infringement be detected?",
    secretIf: "No: it runs inside a plant you cannot see",
    patentIf: "Yes: the product can be bought and analysed" },
  { id: "life", q: "How long is the useful life against the 20-year term?",
    secretIf: "Short, or far longer than the term",
    patentIf: "Comparable to the term" },
  { id: "cost", q: "Can you afford to file and enforce where it matters?",
    secretIf: "No, or the markets are too many",
    patentIf: "Yes, in the few markets that matter" },
  { id: "turnover", q: "Can the secret survive staff turnover?",
    secretIf: "Yes: few people hold it, and the steps are real",
    patentIf: "No: many people carry it out the door" },
];

/** Step 5's two inventions, answered question by question. */
export const CONTRAST: readonly {
  id: string; name: string; answers: Record<string, string>; lands: "patent" | "secret";
}[] = [
  { id: "catalyst", name: "Catalyst recipe used in your own plant",
    lands: "secret",
    answers: {
      reverse: "No -- the product is a commodity, identical to everyone's",
      detect: "No -- a rival's reactor is behind its fence",
      life: "Long, if the recipe is not found independently",
      cost: "Filing everywhere a rival might build a plant",
      turnover: "Yes, if few people hold the whole recipe",
    } },
  { id: "molecule", name: "New molecule you sell",
    lands: "patent",
    answers: {
      reverse: "Yes -- any customer can analyse it",
      detect: "Yes -- the product is on the market",
      life: "Often comparable to the term",
      cost: "Filing in the markets where it is sold",
      turnover: "Irrelevant: selling it reveals it",
    } },
];

/** The periods of step 6, applied by the page's calculator. */
export const DEADLINES: readonly { id: string; label: string; months: number; from: "first" | "filing"; cite: string }[] = [
  { id: "prio", label: "Last day to file abroad claiming priority",
    months: 12, from: "first", cite: "EPC Art. 87(1)" },
  { id: "pub", label: "Publication: competitors can read it",
    months: 18, from: "first", cite: "EPC Art. 93(1); PCT Art. 21(2)(a)" },
  { id: "pct", label: "PCT national phase entry",
    months: 30, from: "first", cite: "PCT Art. 22(1)" },
  { id: "ep", label: "PCT entry at the European Patent Office",
    months: 31, from: "first", cite: "EPC Rule 159(1)" },
  { id: "exp", label: "Expiry of a patent filed that day",
    months: 240, from: "filing", cite: "EPC Art. 63(1)" },
];

/** Add whole calendar months to an ISO date (YYYY-MM-DD), clamping the day
 *  to the end of a shorter month.  Returns null for a date it cannot read. */
export function addMonths(iso: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const total = y * 12 + (mo - 1) + months;
  const ny = Math.floor(total / 12); const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, last);
  const pad = (n: number, w: number): string => String(n).padStart(w, "0");
  return `${pad(ny, 4)}-${pad(nm + 1, 2)}-${pad(nd, 2)}`;
}

// ---- The exercise (step 4 of C140's scope) ---------------------------------

export type IpChoice = "patent" | "secret" | "publish";
export const IP_CHOICES: readonly IpChoice[] = ["patent", "secret", "publish"];

export interface ExerciseOutcome {
  /** What the competitor does after reading your filings and your market. */
  rival: string;
  /** What that does to you, and why. */
  result: string;
}

export interface ExerciseInvention {
  id: string;
  kind: string;
  name: string;
  facts: string;
  outcomes: Record<IpChoice, ExerciseOutcome>;
  /** The choice the page defends, and why -- one defensible answer, not
   *  the only one. */
  defended: IpChoice;
  why: string;
}

export const EXERCISE_COMPANY = "Fictitia Process Chemicals (a fictitious "
  + "company) runs one plant in Portugal and sells in Europe.  Its rival, "
  + "Rivalis (also fictitious), reads every application Fictitia publishes, "
  + "buys its products, and hires its engineers when it can.";

export const EXERCISE: readonly ExerciseInvention[] = [
  {
    id: "process", kind: "Process improvement",
    name: "A new catalyst activation that raises selectivity by four points",
    facts: "Used only inside Fictitia's own reactor.  The product is a "
      + "commodity, chemically identical to Rivalis's.  Six people know the "
      + "full procedure.",
    outcomes: {
      patent: {
        rival: "Rivalis reads the application when it is published at 18 "
          + "months and starts the activation in its own plant -- abroad, "
          + "where Fictitia did not file, and quietly at home.",
        result: "You cannot see inside Rivalis's reactor, and the product is "
          + "not new, so no presumption helps you (TRIPS Art. 34; CPI Art. "
          + "99).  You paid to teach your rival.",
      },
      secret: {
        rival: "Rivalis sees nothing in the filings and nothing in the "
          + "product.  It tries to hire one of the six.",
        result: "The secret holds as long as the reasonable steps are real; "
          + "the engineer may take experience and skill but not your files "
          + "(Directive Art. 1(3), Art. 4).  If Rivalis finds it "
          + "independently and patents it, your dated records of USE are "
          + "your Portuguese prior-user right (CPI Art. 105) -- keep them.",
      },
      publish: {
        rival: "Rivalis reads the paper and adopts the activation.",
        result: "No one can patent it now, you included; your four points of "
          + "selectivity are everyone's.  You gave away an advantage you "
          + "could have kept.",
      },
    },
    defended: "secret",
    why: "Invisible in use, not revealed by the product, and policeable "
      + "neither at home nor abroad: the catalyst recipe of step 5.",
  },
  {
    id: "product", kind: "New product",
    name: "A new polymer additive that Fictitia will sell",
    facts: "A new molecule; customers will receive kilograms of it.  "
      + "Standard analysis identifies its structure in a day.",
    outcomes: {
      patent: {
        rival: "Rivalis reads the application, files on close analogues to "
          + "fence you in, and considers an opposition within nine months of "
          + "grant (EPC Art. 99).",
        result: "Your claims cover the molecule and you can see any copy on "
          + "the market.  The fence is the risk: claim the family broadly "
          + "enough, support it with examples (Art. 83), and use the "
          + "priority year and a divisional to answer Rivalis's filings.",
      },
      secret: {
        rival: "Rivalis buys a sample, analyses it -- lawfully (Directive "
          + "Art. 3(1)(b)) -- and makes it.",
        result: "Your product on the market became prior art the day it was "
          + "sold (EPC Art. 54(2); G 1/92; G 1/23): neither you nor anyone "
          + "can patent it now.  The 'secret' lasted one delivery.",
      },
      publish: {
        rival: "Rivalis reads the paper and makes the additive.",
        result: "No one can patent it; you have no exclusivity in a product "
          + "you paid to invent.",
      },
    },
    defended: "patent",
    why: "Revealed by sale, detectable on the market: the new molecule of "
      + "step 5.  File before the first sample leaves the building.",
  },
  {
    id: "method", kind: "Analytical method",
    name: "A fast in-line method for a trace impurity",
    facts: "Used for Fictitia's own quality control.  Licensing it would "
      + "earn little; losing the right to use it would stop the plant's "
      + "release testing.",
    outcomes: {
      patent: {
        rival: "Rivalis reads the application and designs a different "
          + "measurement.",
        result: "You hold a right worth little as a licence, paid for in "
          + "every country, and you have published the method.  Defensible "
          + "only if the method itself is a product you can sell.",
      },
      secret: {
        rival: "Rivalis develops a similar method independently and files "
          + "a patent on it.",
        result: "Its patent may now cover the method your plant relies on.  "
          + "Your defence is a prior-user right, national and only with "
          + "dated proof of use (CPI Art. 105) -- or an opposition with "
          + "prior art, if any was ever public.",
      },
      publish: {
        rival: "Rivalis can use the method, but cannot patent it.",
        result: "Your freedom to operate is secured for everyone, you "
          + "included (EPC Art. 54(2)); you gave away a method that earned "
          + "you nothing on its own.",
      },
    },
    defended: "publish",
    why: "Its value to Fictitia is the freedom to use it, not the right to "
      + "exclude: a defensive publication buys that freedom cheaply (step "
      + "7).  Secret is defensible too, with dated records of use.",
  },
];

export const IP_LIMITS: readonly LessonLimit[] = [
  {
    id: "not-advice",
    title: "This is not legal advice.",
    body: IP_NOT_ADVICE,
  },
  {
    id: "jurisdictions",
    title: "A few jurisdictions are read, not all of them.",
    body: "The page reads the European Patent Convention, the EU trade-secrets "
      + "directive, Portuguese law and, for contrast, a few US provisions and "
      + "the historical UK Acts.  "
      + "Other countries differ, sometimes completely -- grace periods, "
      + "prior-user rights, utility models and employee-invention rules most "
      + "of all.",
  },
  {
    id: "dated",
    title: "The law was read on one date.",
    body: "Every article, rule and decision was read online on 2026-10-26.  "
      + "Laws are amended and case law moves (G 1/23 changed how G 1/92 is "
      + "read in 2025).  Check the current text before relying on any of it.",
  },
  {
    id: "no-numbers",
    title: "No cost, no statistic.",
    body: "The page quotes no filing cost and no rate of litigation, decoy "
      + "filing or settlement, because no source it could check records one "
      + "that would hold for a reader's case.  The exercise's outcomes are "
      + "the page's reasoning on fictitious facts, not predictions.",
  },
  {
    id: "history-contested",
    title: "The history is contested.",
    body: "The Wright and Watt stories are told with the scholarship that "
      + "disputes them.  Whittle's case is a question, not a verdict: no "
      + "court ever ruled on it.",
  },
];

/** The questions at the foot of the page (DEV.md 4c C158). */
export const IP_QUIZ: readonly QuizQuestion[] = [
  {
    id: "defensive-publication", steps: [7],
    q: "A firm publishes its process idea in an obscure foreign journal.  "
      + "What does that achieve under the European Patent Convention?",
    options: [
      "It proves the firm had the idea first, so the firm can later patent it",
      "It makes the idea unpatentable for everyone, the firm included",
      "Nothing: a journal few people read is not prior art",
    ],
    correct: 1,
    feedback: "Novelty is judged against everything made available to the "
      + "public, anywhere, before the filing date (EPC Art. 54(2)), and the "
      + "theoretical possibility of access is enough -- no one has to have "
      + "read it.  The publication creates no right for its author; it "
      + "destroys novelty for all, and the EPC disregards an earlier "
      + "disclosure only for an evident abuse or a recognised exhibition "
      + "(Art. 55).",
  },
  {
    id: "catalyst-or-molecule", steps: [4, 5],
    q: "Why does a catalyst recipe used in your own plant usually suit "
      + "secrecy, while a new molecule you sell suits a patent?",
    options: [
      "Because catalysts cannot be patented and molecules can",
      "Because the recipe is invisible in use and its infringement "
        + "undetectable, while the molecule is revealed by every sale and a "
        + "marketed product is prior art",
      "Because secrets last longer than patents in every case",
    ],
    correct: 1,
    feedback: "Both can be patented.  What decides is whether the invention "
      + "can be reverse-engineered from what you sell and whether you could "
      + "detect a copy: the molecule fails as a secret the day it is sold, "
      + "and selling it first would also destroy your own novelty (G 1/92, "
      + "G 1/23); the recipe stays hidden, and patenting it would publish it "
      + "to rivals you cannot police.",
  },
  {
    id: "process-not-working", steps: [15],
    q: "A granted European patent claims a process with a stated minimum "
      + "yield.  You follow its recipe faithfully and never reach that "
      + "yield.  What is your strongest route?",
    options: [
      "None: once granted, a patent cannot be challenged",
      "Oppose within nine months of grant (or seek revocation later) for "
        + "insufficient disclosure, with a reproducible report that follows "
        + "the patent's teaching",
      "Tell the patent office once that one example failed; the burden is "
        + "then on the owner",
      "Ignore it: a process patent cannot be infringed",
    ],
    correct: 1,
    feedback: "Insufficiency is a ground of opposition (EPC Art. 100(b)) and "
      + "of revocation (Art. 138(1)(b); in Portugal CPI Art. 114(d)).  A "
      + "granted patent is presumed valid; you must raise serious doubts "
      + "backed by verifiable facts, and a single unexplained repetition "
      + "has been held inadequate (T 406/91).  Because the yield is IN the "
      + "claim, failing to reach it is a sufficiency question (G 2/21, "
      + "Reasons 74).",
  },
  {
    id: "blocking-patents", steps: [16],
    q: "Firm B adds cooled blades to Firm A's patented turbine and patents "
      + "the improvement.  What is the position?",
    options: [
      "B is free to sell its turbine, because it added a feature",
      "The two patents block each other; a cross-licence, or failing it a "
        + "compulsory licence for the dependent patent, is the way out",
      "A's patent is void, because the original turbine did not work",
    ],
    correct: 1,
    feedback: "B's turbine still has every feature of A's claim, and a "
      + "'comprising' claim does not exclude extra features, so B needs A's "
      + "licence; A needs B's to use the cooling.  If blade cooling is "
      + "common general knowledge, A's patent is probably sufficient and "
      + "survives.  TRIPS Art. 31(l) and CPI Art. 108(1)(b) and 110 provide "
      + "the compulsory licence for dependence.",
  },
  {
    id: "prior-use", steps: [8],
    q: "You have used a secret process in your Portuguese plant for years.  "
      + "A rival now patents the same process.  What protects you?",
    options: [
      "A prior-user right, if you can prove good-faith use or serious "
        + "preparations before the rival's filing date -- in Portugal only",
      "Nothing: the patent always wins",
      "Your e-Soleau deposit, which gives you the patent instead",
    ],
    correct: 0,
    feedback: "CPI Art. 105 lets a good-faith prior user continue, within "
      + "the extent of its earlier knowledge and for its own business, and "
      + "puts the burden of proof on the user.  The right is national.  A "
      + "dated deposit proves only the date of a document -- it gives no "
      + "intellectual property right and does not by itself prove use.",
  },
  {
    id: "where-the-line-is", steps: [14],
    q: "Which of these crosses the line from strategy into conduct a court "
      + "or competition authority can sanction?",
    options: [
      "Patenting the alternative routes around your own process",
      "Reverse-engineering a competitor's product bought on the market",
      "Obtaining extended protection by misleading the patent office",
      "Opposing a competitor's patent through an intermediary",
    ],
    correct: 2,
    feedback: "Fencing your own process is ordinary practice (step 9), "
      + "reverse engineering a product bought on the market is lawful "
      + "(Directive Art. 3(1)(b)), and an opposition filed by a straw man is "
      + "admissible (G 3/97).  Misleading a patent "
      + "office was held an abuse of a dominant position in the EU "
      + "(T-321/05), and in the US withholding but-for material information "
      + "with intent to deceive makes a patent unenforceable (Therasense).",
  },
];

// ---- Sources -----------------------------------------------------------------

export interface IpSource {
  short: string;
  cite: string;
  /** What was read in it, article by article -- the claim the page makes
   *  from it is only as good as this line. */
  read: string;
  url: string;
  /** How it was read when it could not be fetched directly. */
  note?: string;
}

export const IP_SOURCES: readonly IpSource[] = [
  { short: "EPC", cite: "European Patent Convention, 17th edition text as "
      + "published by the European Patent Office",
    read: "Arts. 52, 54, 55, 56, 57, 60, 63, 64, 69, 76, 83, 87, 88, 93, 99, "
      + "100, 101, 115, 138; Rules 36, 159",
    url: "https://www.epo.org/en/legal/epc" },
  { short: "EPO Guidelines", cite: "Guidelines for Examination in the "
      + "European Patent Office, 2025",
    read: "E-VI 3 (third-party observations, anonymous); F-III 1, 3, 4 "
      + "(sufficiency, research programme, burden); F-IV 4.20 "
      + "('comprising'), 4.22 (broad claims); G-VII 5.2",
    url: "https://www.epo.org/en/legal/guidelines-epc" },
  { short: "Case Law", cite: "Case Law of the Boards of Appeal of the EPO, "
      + "2025 online edition",
    read: "I.C.3.1 (availability to the public: T 444/88, T 381/87, "
      + "G 1/92); II.C.4.1 (skilled person, effective filing date, "
      + "textbooks); II.C.9.1 and 9.4 (burden of proof: T 19/90, T 182/89, "
      + "T 406/91, T 1076/21); IV.C.2.1.5 (straw man: G 3/97, G 4/97)",
    url: "https://www.epo.org/en/legal/case-law" },
  { short: "G 2/21", cite: "Enlarged Board of Appeal, G 2/21, 23 March "
      + "2023, OJ EPO 2023, A85",
    read: "Headnote I and II; Reasons 74 and 77",
    url: "https://www.epo.org/en/legal/official-journal/2023/09/a85" },
  { short: "G 1/23", cite: "EPO press communiqué of 2 July 2025 on "
      + "decision G 1/23",
    read: "A product put on the market is not excluded from the state of the "
      + "art solely because its composition could not be reproduced",
    url: "https://www.epo.org/en/case-law-appeals/communications/"
      + "press-communique-2-july-2025-concerning-decision-g-123-solar-cell" },
  { short: "EPO UP/UPC", cite: "European Patent Office, Unitary Patent and "
      + "Unified Patent Court pages",
    read: "The 18 participating states, Portugal among them; the UPC's "
      + "jurisdiction over unitary and European patents",
    url: "https://www.epo.org/en/applying/european/unitary/unitary-patent" },
  { short: "TRIPS", cite: "Agreement on Trade-Related Aspects of "
      + "Intellectual Property Rights (WTO)",
    read: "Arts. 31(l), 33, 34, 39",
    url: "https://www.wto.org/english/docs_e/legal_e/27-trips_04c_e.htm" },
  { short: "PCT", cite: "Patent Cooperation Treaty (WIPO)",
    read: "Arts. 21(2)(a), 22(1) and 22(3)",
    url: "https://www.wipo.int/pct/en/texts/articles/a22.html" },
  { short: "Directive 2016/943", cite: "Directive (EU) 2016/943 on the "
      + "protection of undisclosed know-how and business information "
      + "(trade secrets)",
    read: "Arts. 1(3), 2(1), 3(1), 4(2)-(3)",
    url: "https://www.legislation.gov.uk/eudr/2016/943/contents",
    note: "Read in the UK National Archives' copy of the directive as "
      + "adopted; EUR-Lex refused automated access" },
  { short: "CPI", cite: "Código da Propriedade Industrial, Decreto-Lei "
      + "110/2018 (Portugal), consolidated text",
    read: "Arts. 32, 34, 55, 56, 58, 66, 99, 100, 105, 108, 110, 114, 115, "
      + "119, 121, 122, 142, 313, 314, 315",
    url: "https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=2979&tabela=leis",
    note: "Read in the consolidated text of the Procuradoria-Geral "
      + "Distrital de Lisboa; the official consolidation is in the Diário "
      + "da República" },
  { short: "LOSJ", cite: "Lei 62/2013, Lei da Organização do Sistema "
      + "Judiciário (Portugal)",
    read: "Art. 111(1)(d): the Tribunal da Propriedade Intelectual hears "
      + "patent nullity actions",
    url: "https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=1974&tabela=leis" },
  { short: "35 USC", cite: "United States Code, Title 35 (Patents)",
    read: "§§ 102(b)(1), 112(a), 120, 273(a)",
    url: "https://www.law.cornell.edu/uscode/text/35" },
  { short: "UK Acts", cite: "Patents and Designs Act 1907; Patents Act "
      + "1949; Patents Act 1977 (legislation.gov.uk)",
    read: "1907 s. 25 (as enacted); 1949 s. 32(1)(g)-(h) (as enacted); "
      + "1977 s. 72(1)",
    url: "https://www.legislation.gov.uk/ukpga/Geo6/12-13-14/87/section/32/enacted" },
  { short: "PRE v Columbia", cite: "Professional Real Estate Investors, "
      + "Inc. v. Columbia Pictures Industries, Inc., 508 U.S. 49 (1993)",
    read: "The two-part definition of sham litigation",
    url: "https://www.law.cornell.edu/supct/html/91-1043.ZO.html" },
  { short: "Therasense", cite: "Therasense, Inc. v. Becton, Dickinson & "
      + "Co., 649 F.3d 1276 (Fed. Cir. 2011) (en banc)",
    read: "Specific intent to deceive and 'but-for' materiality, as stated "
      + "at 1290-92 and recited in the district court's remand order",
    url: "https://patentlaw.jmbm.com/files/2016/12/Therasense.pdf",
    note: "Read in the remand order of the US District Court, N.D. Cal., "
      + "case 3:04-cv-02123-WHA, document 1147, 27 March 2012" },
  { short: "T-321/05", cite: "General Court of the EU, AstraZeneca v "
      + "Commission, T-321/05, judgment of 1 July 2010 (press release "
      + "67/10)",
    read: "Misleading representations to national patent offices upheld as "
      + "an abuse of a dominant position.  The 2012 appeal (C-457/10 P) was "
      + "not read",
    url: "https://curia.europa.eu/jcms/jcms/P_65738/" },
  { short: "Huawei v ZTE", cite: "Court of Justice of the EU, C-170/13, "
      + "judgment of 16 July 2015 (press release 88/15)",
    read: "Standard-essential patents, FRAND undertakings, injunctions",
    url: "https://curia.europa.eu/jcms/upload/docs/application/pdf/2015-07/cp150088en.pdf" },
  { short: "FTC 2016", cite: "US Federal Trade Commission, Patent "
      + "Assertion Entity Activity: An FTC Study, October 2016",
    read: "Definition of PAEs; portfolio and litigation PAEs",
    url: "https://www.ftc.gov/reports/patent-assertion-entity-activity-ftc-study",
    note: "Read through a search tool's reading of ftc.gov; the direct "
      + "fetch failed" },
  { short: "Cohen, Nelson, Walsh", cite: "W. M. Cohen, R. R. Nelson, J. P. "
      + "Walsh, Protecting Their Intellectual Assets: Appropriability "
      + "Conditions and Why U.S. Manufacturing Firms Patent (or Not), NBER "
      + "Working Paper 7552, 2000",
    read: "Abstract: secrecy and lead time most emphasised, patents least; "
      + "blocking substitutes in chemicals; reasons to patent",
    url: "https://www.nber.org/papers/w7552" },
  { short: "Shapiro", cite: "C. Shapiro, Navigating the Patent Thicket: "
      + "Cross Licenses, Patent Pools, and Standard Setting, Innovation "
      + "Policy and the Economy 1 (2001)",
    read: "Abstract: thickets, cross-licences, pools, complements and "
      + "substitutes",
    url: "https://www.nber.org/books-and-chapters/innovation-policy-and-economy-volume-1/navigating-patent-thicket-cross-licenses-patent-pools-and-standard-setting" },
  { short: "WIPO", cite: "WIPO, PATENTSCOPE glossary and the utility "
      + "models page",
    read: "Freedom-to-operate search; what a utility model is and that its "
      + "rules vary by country",
    url: "https://www.wipo.int/patentscope/en/db/glossary.html" },
  { short: "Research Disclosure", cite: "Research Disclosure, a defensive "
      + "publication journal",
    read: "Its own description of the service",
    url: "https://www.researchdisclosure.com/" },
  { short: "INPI e-Soleau", cite: "Institut national de la propriété "
      + "industrielle (France), e-Soleau",
    read: "Proof that a document existed on a date; kept five years, "
      + "extendable",
    note: "That it confers no intellectual property right was read through "
      + "a search tool's reading of inpi.fr pages",
    url: "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/"
      + "deposer-une-e-soleau-ou-un-entiercement" },
  { short: "BOIP i-DEPOT", cite: "Benelux Office for Intellectual "
      + "Property, i-DEPOT",
    read: "A dated deposit offered by the Benelux office",
    url: "https://www.boip.int/en/entrepreneurs/ideas/submit-an-i-depot",
    note: "Read only through a search tool's reading of boip.int; the "
      + "direct fetch was refused, so the page claims no more than that "
      + "the deposit exists" },
  { short: "Wright cases", cite: "Wright Co. v. Herring-Curtiss Co., 204 F. "
      + "597 (W.D.N.Y. 1913); 211 F. 654 (2d Cir. 1914)",
    read: "Patent 821,393, filed 23 March 1903, granted 22 May 1906; the "
      + "appeal decided 13 January 1914",
    url: "https://www.courtlistener.com/opinion/8806906/wright-co-v-herring-curtiss-co/" },
  { short: "Centennial of Flight", cite: "U.S. Centennial of Flight "
      + "Commission, The Wright Patent Battles",
    read: "The litigation, the Manufacturers' Aircraft Association, the "
      + "pool and its one-percent royalty",
    url: "https://centennialofflight.net/essay/Wright_Bros/Patent_Battles/WR12.htm" },
  { short: "Katznelson and Howells", cite: "R. D. Katznelson, J. Howells, "
      + "The myth of the early aviation patent hold-up, Industrial and "
      + "Corporate Change 24(1) (2015) 1-64",
    read: "Abstract",
    url: "https://ideas.repec.org/a/oup/indcch/v24y2015i1p1-64..html" },
  { short: "Boldrin and Levine", cite: "M. Boldrin, D. K. Levine, Against "
      + "Intellectual Monopoly, Cambridge University Press, 2008, ch. 1",
    read: "Watt's 1769 patent, its 1775 extension to 1800, high pressure",
    url: "https://cdn.nakamotoinstitute.org/docs/against-intellectual-monopoly.pdf" },
  { short: "Selgin and Turner", cite: "G. Selgin, J. L. Turner, Strong "
      + "Steam, Weak Patents, Journal of Law and Economics 54(4) (2011) "
      + "841-861",
    read: "Abstract",
    url: "https://ideas.repec.org/a/ucp/jlawec/doi10.1086-658495.html" },
  { short: "Whittle 1945", cite: "F. Whittle, The Whittle Jet Propulsion "
      + "Gas Turbine, First James Clayton Lecture, Institution of "
      + "Mechanical Engineers, 6 October 1945, as printed in The Engineer",
    read: "The January 1930 patent; the lapse for an unpaid renewal fee; "
      + "the temperature objection; testing from 12 April 1937",
    url: "https://theengineer.markallengroup.com/production/content/uploads/2016/10/Frank-Whittle-1945-.pdf" },
  { short: "Starr 2019", cite: "F. Starr, commentary on Whittle's 1928 "
      + "thesis, Journal of Aeronautical History, Paper 2019/01, Royal "
      + "Aeronautical Society",
    read: "Reference 19: British application 347,206, filed 16 January 1930",
    url: "https://www.aerosociety.com/media/12516/paper-2019-01-starr-whittle-thesis.pdf" },
  { short: "Science Museum Group", cite: "Science Museum Group collection, "
      + "Gloster-Whittle E28/39 jet aeroplane",
    read: "First official flight on 15 May 1941",
    url: "https://collection.sciencemuseumgroup.org.uk/objects/co29600/gloster-whittle-e28-39-jet-aeroplane-built-1941" },
  { short: "NACA RM E50I04", cite: "H. H. Ellerbrock, F. S. Stepka, "
      + "Experimental Investigation of Air-Cooled Turbine Blades in "
      + "Turbojet Engine I, NACA RM E50I04, 1950 (NASA Technical Reports "
      + "Server 19730065445), and the series to XIII (1953)",
    read: "Summary: a production turbojet's original blades replaced by "
      + "air-cooled hollow blades for the tests; the memorandum was "
      + "classified when issued",
    url: "https://ntrs.nasa.gov/citations/19730065445" },
  { short: "NASA SP-290", cite: "A. J. Glassman (ed.), Turbine Design and "
      + "Application, volume 3, NASA SP-290, 1975",
    read: "Preface and contents: a course text whose chapters include "
      + "turbine cooling",
    url: "https://ntrs.nasa.gov/citations/19750016669" },
];
