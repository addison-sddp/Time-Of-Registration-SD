# Pending owner requests (build-5)

Saved 2026-10-27 at the owner's request, to start after the usage limit resets (2:10 AM, Tuesday,
October 27). Nothing here is started. The build-4 work (audio, art, shift flow) is in the working tree,
NOT committed, and awaits the owner's go-ahead to commit. Follow the working agreement in HANDOFF.md.

The owner attached screenshots from play (Firefox). They are not saved in the repo; what they showed is
described in words below.

## Audio

1. The random ambient "phone ringing" sound should sound clearly like a phone ringing. The other random
   ambient sounds (chair creak, vent whoosh, fluorescent tick) are not recognizable either; make each one
   clearly what it is.
2. Never play two ambient cues at once. The phone ring sometimes doubled up.
3. Make ambient cues less frequent (currently every 8-25 s).
4. Shift transitions: fade into and out of the shift summary screen. When a new day starts after the
   player presses Continue, play a car ignition starting, as if driving to work.

## Controls

5. The game is presented as point-and-click. Remove the key-control description text from the play
   screen and leave that space blank. OWNER DECISION (confirmed): KEEP the keyboard capability in the
   game, but don't advertise it. List the keybinds only in the Settings menu, with no other prompts or
   hints. Record this in DESIGN 7.5.
6. Dragging the bulletin selects (highlights) its text. Players must not be able to select text on desk
   items.

## Bulletin and rulebook

7. The bulletin describes only the NEW rules for that month or level.
8. Add a RULEBOOK the player can open, containing ALL active rules. It starts CLOSED each day until the
   player opens it. Put the Minnehaha County seal (the existing original fictional seal) on its cover.
   After the rules, add a notes page where the player can type free plaintext notes, styled like standard
   ruled notebook paper.
   - Notes need to persist. That needs a save field: optional, or a v2 migration per DESIGN 6.5.
9. Rule wording is simpler and immersive. No "Rule R1_AGE: Age" headings. Use a plain bold title such as
   "Age minimum" with a simplified description under it in regular type.
10. On days when proof of citizenship is not required (before April 2026), the age rule text must not
    mention citizenship documents. Rule text must fit only what that day requires.

## Desk layout

11. Move the "Next election" display to the space right of the booth window, above the Next applicant
    button, where the owner marked a red box. That box holds a sign reading "Next Election", with a
    retro clock-style readout at its bottom: black background, red digits, showing the election date.
    Under it (the owner's blue box with a red border), add a sign: "Registrants must be born before:
    [DATE]". OWNER DECISION (confirmed): "born before". R1 passes when the birth date is ON OR BEFORE
    the cutoff (election date minus 18 years), so for "before" to be exact, the sign shows the cutoff
    plus one day. Example: cutoff 2008-06-02 displays "born before June 3, 2008". Compute it from the
    calendar, never hardcoded. Add a test that the displayed date and R1 agree at the boundary.
12. Remove the ledger list. Feedback after each filed decision comes as a slip printed from the bulletin
    printer: light red for a mistake, light green for a correct decision.
13. In the ledger's old spot (top right), add a decorative analog wall clock (hands, numbers 1-12) showing
    the player's real local time of day.
14. Make the Sioux Falls desk flag bigger, and have it hang limp and freely (no wind) rather than waving.
15. The income counter has no purpose. Add stakes that make the player want correct answers, and
    something to spend income on.
    - OWNER DECISION: DEFERRED to the run AFTER build-5. Do not build it in build-5. The owner has a list
      of options (see "Income and stakes options" at the end of this file) to choose from first. This
      overlaps Part B6.

## Documents

16. Voter registration application: the "V" in the title is cut off by the folded top-right corner. Keep
    the fold; move or fit the text.
17. Make the voter registration application look more like the real South Dakota form (one owner
    screenshot). That form is a full letter-size page with numbered sections down the left:
    1. Eligibility (two yes/no questions)
    2. Birthdate
    3. Name (last, first, middle, suffix)
    4. Identification
    5. Residence address
    6. Mailing address
    7. Party affiliation
    8. Declaration with signature

    Each section has light blue input boxes and a bold left-hand label column.
    - Keep the fields the game fills today (name, date of birth). The other sections appear as visual
      stand-ins: gray boxes or lines where text would go.
    - Originality: do NOT reproduce the real state seal, form number, statute citations or exact text;
      match the general layout and paper size only.
18. Text overlaps on the SD license front: the expiration date runs into "SD" under Issued by. The
    license back has overlaps too: the tiny digit string sits on top of the barcode (owner circled it).
    The owner's screenshot of the back showed "RESTR: NONE" and "CLASS: D", not the specified SD back
    layout. Check which back is rendering for SD licenses versus other-state cards, and fix it.
19. The emblem at the top left of each driver's license should be an icon shaped like the issuing state.
    SD shows a South Dakota outline, not the three yellow bars. Other states get their own state outline.
20. The U.S. passport should look like a passport book. The player must open it to see the data page.
21. Denial checklist: change "Below eligibility date for the next election" to "Below minimum voter
    registration age".

## Applicants and portraits

22. Some hair looks wrong. One example: hair spiking straight up out of the head in thin spikes, on a
    woman with long braids. Fix the hair generator so locks fall naturally.
23. Applicants' appearance should match their documents:
    - Sex: female applicants USUALLY look female and male applicants USUALLY look male, with room for
      variation. OWNER DECISION (confirmed): build an explicit sex field.
      - Add `sex: "M" | "F" | null` to the Document type and generate it per applicant.
      - Pick first names from sex-matched name lists, and print "Sex: M" or "Sex: F" on identification
        documents (licenses, IDs, tribal ID, passport).
      - The portrait reads it for presentation, with some variation allowed.
      - No rule checks it (it is not a registration requirement). Keep the field consistent across one
        applicant's documents.
      - Update DESIGN 3.4, the engine types, fixtures and the generator tests.
    - Age: one example was a 91-year-old on the license who looked young. The portrait must reflect the
      birth date: gray or white hair, wrinkles, a softer jaw for older people; younger looks for young
      ones.
24. Use real South Dakota city and town names in addresses. Street names and numbers stay fictional.
    Other-state addresses can stay fictional. Check that the ZIPs stay plausible.
25. In Firefox, applicants have no walk-in or walk-out animation; they just appear and vanish. Fix it
    across browsers and test in Firefox.

## Progression

26. Moving from one level to the next adds no new requirement. Today only R3 (April 2026) is introduced
    after October.
    - Needs owner design input. Ask which rules come in which month before building. Per DESIGN 1.3 and
      Part B, rules and their sources come from the owner.

## Open questions to ask the owner first

- Item 26: which new rules arrive in which months.
- Resolved 2026-10-27: item 11 ("born before"), item 5 (keyboard kept, hidden, listed in Settings),
  item 23 (explicit sex field), item 15 (deferred until after build-5).

## Income and stakes options (for the owner to choose from; build after build-5)

Drafted 2026-10-27. These are original mechanics in the inspection-game genre, not copied from any game.
All in-game text must stay neutral and procedural (DESIGN 1.2). Pick, combine or reject.

**A. Nightly household budget.** At shift end, a plain ledger lists the day's bills. Each night the
player checks which to pay from that day's earnings plus savings, and anything unpaid has a knock-on
effect.
- Bills: rent, heat, groceries, gas for the commute, and an occasional prescription or car repair.
- Heat costs rise from November through March, which fits a South Dakota winter.
- Unpaid bills escalate the household's status from "cold" or "hungry" to "sick", and a sick family
  member needs medicine.
- Status is shown only as flat words, never commentary.

**B. Commute and car.** Gas is a daily cost; this ties in with the car-ignition sound.
- An empty tank means a late start: fewer applicants that day, so less pay.
- A random repair bill tests the player's savings.

**C. Citations and employment status.** Each error past a free first one prints a numbered citation
slip, which the existing red slip could become.
- Citations accumulate: a written warning, then probation (pay docked), then dismissal (game over,
  with no editorial ending text).
- Clean shifts clear one citation.

**D. Desk upgrades bought with income.** Purchased in a short evening catalog. Each one makes
inspection easier, which gives income a direct gameplay use. Examples:
- a magnifier for fine print (useful for the "U.S. Citizen" line),
- a desk calendar or age wheel for the birth-date cutoff,
- rulebook index tabs,
- a faster printer,
- a better chair (cosmetic).

**E. Throughput pay and the shift clock.** Add a visible shift clock, so more correct decisions earn
more. This trades accuracy against speed.
- It reverses DESIGN 2.1 ("no time limit"), so it needs owner sign-off.

**F. Savings goal tied to the ending.** A fixed household goal (for example, a car payoff or a
family event) that the player is working toward by the June 3 shift. Reaching it or not changes one
line of the ending.
- Ending copy stays the owner's to write (Part B).

**G. Supervisor quota memos.** Some months the printer delivers a memo setting a minimum number of
applications processed, with a small bonus or a penalty.
- Wording stays procedural and neutral.

**Recommended starting combination:** A + C + D.
- A gives income a reason to exist.
- C gives errors stakes beyond money.
- D lets income feed back into play.

B and G layer on later. E changes the design's "no time limit" decision.
