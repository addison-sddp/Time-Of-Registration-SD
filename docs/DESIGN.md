# Time of Registration, SD: Design Document

Status: DRAFT, round 1. Nothing in this document is verified. Every rule, citation, date, calendar entry, and license is `verified: false` until the project owner changes it.

Conventions used throughout:

- "Owner" is the project owner. Only the owner may set any `verified` value to true.
- "(owner-given)" marks a fact taken from the owner's brief. It is still unverified.
- "PROPOSAL" marks a design choice made by the drafter that needs owner approval.
- "UNSOURCED" marks a real-world claim for which no source has been located. No web research was performed in this round, so no candidate citation URLs appear. Every citation slot reads UNSOURCED.

---

## 1. Target and tone statement

### 1.1 What this is

A single-screen document-inspection game. The player is a voter registration auditor at a service window in Minnehaha County, South Dakota. Applicants arrive one at a time. The player inspects their documents, compares them against the rules currently in force, approves or denies, and sees the consequence of the decision.

It is a personal, non-commercial parody by the project owner, made independently of the owner's employer. It satirizes the real-world effects of SB 175 (described by the owner as the 2026 South Dakota SAVE Act) and related voter registration rules on South Dakota residents. All applicants are fictional. The document carries no party branding and no political-organization framing, and none may be added to the game.

### 1.2 Tone rules (binding)

1. The game never tells the player the law is bad. The player discovers effects through play: who gets stopped, what documents are demanded, what the rules cannot see.
2. The single explicit editorial statement in the whole game is the newspaper sidebar in Part B, section B5 (text supplied by the owner in the brief; not reproduced or extended here). No other editorial text may appear anywhere: not in the briefing letter, rules text, form labels, error messages, shift summaries, or endings.
3. Voice of all in-game text is bureaucratic and procedural: flat, dated, form-like. Example register: "Document presented is a photocopy. Original required." Not acceptable: any adjective or phrase that evaluates the rules or the people subject to them.
4. Error and rejection messages state which procedural condition was not met, never why the condition is wise or unwise.
5. Portraits are placeholders or procedurally generated. No real photographs. No real person is depicted or portrayed as an applicant.
6. Originality: no artwork, text, music, UI, layout, or numeric/economic design is reproduced from Papers, Please or any other game. Where this document describes a genre convention (inspect, compare, stamp), the implementation is original.

### 1.3 Real names in a parody

The owner's brief uses a real county, a real governor, and real election results in Part B. See Open Questions Q19 and Q20 for the associated risks. This draft treats all such uses as unverified and pending owner decision.

---

## 2. Shift and month structure, and the core loop

### 2.1 Structure

| Unit | Definition | MVP status |
|---|---|---|
| Shift | One level. One in-game day. Player clocks in in the morning and out in the evening. | In scope |
| Applications per shift | 5 to 10 (PROPOSAL: count drawn from the shift seed, see 2.4) | In scope |
| Time limit | None | In scope |
| Error limit | Three errors in a shift returns the player to the start of the same shift. The shift does not advance. | In scope |
| Month | Progression unit, displayed as "[Month] [Year]", starting at "October 2025" | Date display in scope; progression out of scope |
| Month advance | At end of a successful shift: window shutters, fade to black, single tick sound, date advances one month | Part B (B7), not MVP |

### 2.2 In-game date has day granularity internally

The display shows only "[Month] [Year]". The election calendar (section 5) has day-level boundaries (June 2, June 23), and the age rule needs a full election date. Therefore every shift carries a full ISO `shift_date` internally even though only month and year are shown.

PROPOSAL: shifts are defined in a data table `shifts.json` with `{ shift_id, shift_date, rules_activation }`. The MVP ships one or more shifts in sandbox mode (3.5); the shipped progression uses calendar mode. The chosen `shift_date` values are an owner decision (Q4).

### 2.3 Core loop

```
Applicant arrives
  -> player inspects: identity document, residency declaration, proof-of-citizenship documents
  -> player consults: briefing letter (rules), election display ("Next election: <label>, <date>")
  -> player decides: APPROVE stamp or DENY stamp
  -> consequence shown (see 2.5)
  -> next applicant, or shift end
Shift end: summary of applications processed and errors made
```

### 2.4 Applicant generation (PROPOSAL)

- Generation is seeded and deterministic. The PRNG is a small seedable generator (for example a 32-bit mulberry-style function; any well-known seedable PRNG is acceptable). `Math.random` is not used anywhere in generation.
- Seed: `hash(save_salt, shift_id)`. Restarting a shift after three errors replays the identical applicants in the identical order. Rationale: a restart is then a retry of a known test, and automated tests are reproducible.
- Alternative: reshuffle on restart, using `hash(save_salt, shift_id, attempt_number)`. This is flagged as Open Question Q10. The generator takes the seed as a parameter either way, so the choice is one line of orchestration code.
- The generator produces an intended applicant profile (for example "fails Rule 2 only") and renders documents from it. The profile is a generation input only. At runtime the ground truth verdict is always computed by the rule engine from the finished `Application` (section 3.6). The generator's intent is checked against the engine only in tests (section 3.9).

### 2.5 Consequence display

Neutral and minimal. After a decision the applicant leaves; a small ledger line records "Application N: approved/denied". On a correct decision the income counter updates. On an error the error counter increments and a procedural note is shown, for example "Application 4 approved. Condition not met: Rule R3." No explanation of why.

### 2.6 Definition of "error"

An error occurs when:

- the player approves an application that fails any active rule, or
- the player denies an application that passes all active rules.

The engine returns a verdict and the list of violated rule IDs. The UI compares the player's decision to that verdict. The UI never re-derives rule logic.

### 2.7 Shift end

Summary screen: applications processed, correct decisions, errors, earnings (section 6). No evaluative text. On a three-error removal, the summary reads as a plain record: "Shift not completed. Errors: 3." and the shift restarts.

---

## 3. Rule format and rule-engine architecture

### 3.1 Principles (A10, required)

- The rule engine is a pure module. It imports nothing from the UI, DOM, or any framework. It has no clock, no randomness, no I/O. Everything it needs (the application, the in-game date, the calendar, the rule list, the activation mode) is passed in.
- Each rule is a data entry with the owner-fixed fields in 3.2.
- Adding a future rule means adding a data entry and its tests. Core logic is not edited.
- Unit tests cover each rule, rule combinations, and conflict cases (section 3.9).

### 3.2 Rule entry format (fields fixed by owner)

```ts
type RuleId = string;                  // e.g. "R1_AGE"
type YearMonth = string;               // "YYYY-MM"

interface Rule {
  id: RuleId;
  introduced_month: YearMonth;         // first in-game month the rule is in force (calendar mode)
  applies_to: FieldPath[];             // document/application fields the check reads (see 3.4)
  check: CheckSpec;                    // pure function spec (see 3.3)
  error_message: string;               // neutral, procedural; may contain {placeholders}
  source: SourceRef;                   // citation record; may be UNSOURCED
  verified: boolean;                   // ALWAYS false until owner changes it
}

interface SourceRef {
  citation: string;                    // e.g. "SDCL <section> (candidate, unverified)" or "UNSOURCED"
  url?: string;
  note?: string;
}
```

`applies_to` has two jobs. It documents the fields the check reads, and the engine uses it for a generic guard: if a listed field is structurally absent from the application schema, the engine reports a configuration error rather than silently passing. It also lets the test harness verify that a check reads no undeclared field (a rule that reads an undeclared field fails the "declared inputs" test).

### 3.3 Representing `check` (PROPOSAL)

The brief says `check` is a "pure function spec". Two representations are proposed, and the engine accepts both under one interface:

1. Declarative expression (preferred). A JSON predicate tree evaluated by a small generic interpreter. Example operators: `all`, `any`, `not`, `eq`, `in`, `exists`, `date_lte`, `date_gt`, `date_minus_years`, `lookup`, `some_of` (existential quantifier over a list). Rule files are then pure data, serializable, and diffable.
2. Pure function escape hatch. A rule file may export a pure function `(ctx: CheckContext) => CheckResult` with no imports other than shared pure helpers. It is still a self-contained rule file; the core is not edited.

Honesty note: a rule that needs an operator the interpreter does not have requires adding a primitive operator to the interpreter, which is a core edit. The escape hatch exists so that this never blocks a rule; a primitive is promoted to the interpreter only when two or more rules need it. This qualifies the "no core changes" goal and is raised as Open Question Q21.

```ts
interface CheckContext {
  application: Application;
  as_of: ISODate;                      // in-game date
  next_election: ElectionEntry;        // looked up by the engine from the calendar
}
type CheckResult =
  | { outcome: "pass" }
  | { outcome: "fail"; details: { condition: string } & Record<string, string> }   // fills {condition} and other placeholders in error_message
  | { outcome: "not_applicable" };
```

### 3.4 Data types: Application and Document

All dates are ISO `YYYY-MM-DD` strings with no time component and no time zone. Comparison is by calendar-date tuple, never by `Date` millisecond arithmetic.

```ts
type ISODate = string;

type DocumentType =
  | "sd_drivers_license"
  | "other_state_drivers_license"
  | "other_state_nondriver_id"
  | "tribal_id"
  | "birth_certificate"
  | "us_passport"
  | "consular_report_of_birth_abroad"
  | "certificate_of_naturalization"
  | "other_federal_documentation"    // see Q9: representation is open
  | "residency_declaration"
  | "other_unrecognized";            // distractors: library card, employee badge, etc.

interface Document {
  doc_id: string;
  type: DocumentType;
  is_photocopy: boolean;
  issue_date: ISODate | null;
  expiry_date: ISODate | null;
  issuing_jurisdiction: string | null;       // "SD", "MN", "US", or "tribe:<fictional_id>"
  citizenship_verified_marker: boolean | null;  // meaningful for other-state licenses/IDs only
  federal_listed: boolean | null;            // meaningful for other_federal_documentation only (Q9)
  name: string | null;                       // as printed
  birth_date: ISODate | null;
  address_line: string | null;
  address_city: string | null;
  address_state: string | null;              // 2-letter code as printed
  address_postal: string | null;
  address_is_po_box: boolean | null;
  portrait_seed: number | null;              // drives procedural portrait; null if no portrait
}

interface Application {
  application_id: string;
  applicant_name: string;                    // as written on the form
  declared_birth_date: ISODate;              // as written on the form
  id_document: Document | null;
  residency_declaration: Document;           // type "residency_declaration"
  citizenship_documents: Document[];         // may include the same doc as id_document
  // Part B optional sections (absent in MVP): prior_registration?, certification?, overseas?
}
```

Notes:

- `address_is_po_box` is stored explicitly so checks never parse strings. The generator sets it; the document renderer shows "P.O. Box 1123" accordingly.
- There is deliberately no field anywhere recording how many nights the applicant sleeps in South Dakota (see 4.2).
- Name comparison policy (PROPOSAL): case-insensitive, whitespace-collapsed, punctuation-insensitive equality. Nicknames, initials-only, and maiden/married name differences are mismatches in the MVP. Flagged as Q14.

### 3.5 Calendar and activation modes

- The engine receives the election calendar (section 5) as data and an `as_of` date. It never hardcodes an election date.
- Activation mode, passed in by the caller:
  - `"calendar"` (the shipped game): a rule is active iff `introduced_month <= month(as_of)` (and, if the optional `retired_month` extension is adopted, `month(as_of) < retired_month`). In the actual game citizenship is enforced from April 2026, so `R3_CITIZENSHIP` has `introduced_month: "2026-04"`. This is an owner decision (Q1, resolved).
  - `"sandbox"` (dev/test mode, not part of the shipped progression): exists so each regulation can be tested in practice without playing through the whole game. `introduced_month` is ignored. PROPOSAL: sandbox lets the tester pick which rules are active and the `as_of` date (for example through a dev panel or URL parameter), and sandbox sessions do not write progress or economy to the save. The exact tester controls are for owner approval.
- The rule data always carries the true shipped `introduced_month`; sandbox overrides activation at call time and never edits rule data.

### 3.6 Engine interface and verdict

```ts
interface ElectionEntry {
  from: ISODate | null;                // inclusive; null = unbounded
  to: ISODate | null;                  // exclusive; null = unbounded
  election_date: ISODate;
  label: string;
  verified: boolean;                   // always false until owner changes it
}

interface RuleResult { rule_id: RuleId; result: CheckResult; }

interface Verdict {
  verdict: "approve" | "deny";
  violated_rule_ids: RuleId[];         // empty iff verdict === "approve"
  results: RuleResult[];               // all active rules, for UI and tests
  next_election: ElectionEntry;
}

type EngineError =
  | { code: "NO_ELECTION_CONFIGURED"; as_of: ISODate }
  | { code: "OVERLAPPING_CALENDAR_ENTRIES"; as_of: ISODate }
  | { code: "RULE_CONFIG_INVALID"; rule_id: RuleId; reason: string };

function evaluate(
  app: Application,
  as_of: ISODate,
  calendar: ElectionEntry[],
  rules: Rule[],
  mode: "sandbox" | "calendar"
): { ok: true; value: Verdict } | { ok: false; error: EngineError };
```

Behavior:

- Default combination (core, with no optional extensions in use): `deny` iff any active, applicable rule returns `fail`; otherwise `approve`. `not_applicable` neither passes nor fails.
- If the calendar lookup finds no entry for `as_of`, the engine returns `NO_ELECTION_CONFIGURED`. It never guesses, never reuses the last entry, and never falls back to a default. The UI shows a neutral message ("No election date is configured for this date.") and does not count the situation as a player error. In shift generation, a shift whose `shift_date` has no calendar entry fails a data validation test.
- If two calendar entries cover `as_of`, the engine returns `OVERLAPPING_CALENDAR_ENTRIES`.
- Rule evaluation order does not affect the verdict. `violated_rule_ids` is sorted by rule `id` for determinism.
- The engine looks up the election once per `evaluate` call and passes it to every check via `CheckContext`.

### 3.7 Adding a future rule (the "data only" path)

1. Add a rule entry to the rules data (a new file under the rules directory, or a new array element).
2. Add the entry's tests: its own fixtures, plus any new combination or conflict cases against existing rules.
3. Add the rule's briefing text to the narrative data file (B8), keyed by rule `id`.
4. Set `verified: false`.
5. The generator reads the rule list and produces violation profiles from it, so the property test (3.9) covers the new rule without new generator code, provided the rule's `applies_to` fields are ones the generator already knows how to perturb. A new field type needs a generator "perturber" (a data-adjacent plugin, not core engine logic).

### 3.8 Optional extensions for conflicting and contradicting rules (REQUIRE OWNER APPROVAL)

The A4 field list is fixed. Part B says rules later combine, conflict, and occasionally contradict. If that is built, the following OPTIONAL fields are proposed. Each is optional with a default that reproduces the plain-conjunction behavior above, so MVP rules need none of them.

| Optional field | Type | Meaning | Default |
|---|---|---|---|
| `precedence` | integer | Higher wins when two applicable rules in the same `topic` disagree | 0 |
| `topic` | string | Groups rules that can conflict; conflicts are resolved only within a topic | rule `id` (no grouping) |
| `effect` | `"require"` or `"permit"` | `require`: a fail denies. `permit`: a pass overrides lower-precedence `require` failures in the same topic | `"require"` |
| `supersedes` | `RuleId[]` | Listed rules are dropped from evaluation while this rule is active | `[]` |
| `retired_month` | `YearMonth` | Rule stops being active from this month (calendar mode) | none |
| `exceptions` | `RuleId[]` | If this rule passes, failures of the listed rules are waived | `[]` |

Generic resolution algorithm (core, written once, no rule-specific logic):

1. Filter to active rules (mode and month; `retired_month` if adopted).
2. Evaluate each active rule to pass, fail, or not_applicable.
3. Remove rules named by `supersedes` of any active rule that evaluated as applicable.
4. Apply `exceptions`: waive listed failures when the excepting rule passed.
5. For each `topic`, among remaining applicable results take those with the highest `precedence`. Within that set: if any `permit` rule passed, the topic is satisfied; otherwise any `require` failure is a violation.
6. `deny` iff any topic has a violation; `violated_rule_ids` lists the failing `require` rules from violating topics.

Every contradiction pattern Part B needs is then expressed by setting field values in new rule entries, not by editing the algorithm. Termination and determinism are guaranteed because `supersedes` and `exceptions` are single-pass (no transitive chasing); a validation test rejects cycles in `supersedes`. Whether `permit` semantics are desirable at all is a design question for the owner (Q22).

### 3.9 Test plan (Vitest, rule engine only)

| Layer | What is tested | Examples |
|---|---|---|
| Per-rule | Each rule, boundary and negative cases, with fixture applications | R1: born exactly on cutoff date; one day after; Feb 29 birth; R2: SD address, non-SD address, PO box; R3: each acceptable document type; each photocopy/original combination; expired; wrong issuer |
| Calendar | Lookup boundaries; gaps | `as_of` = June 1, June 2, June 22, June 23, June 24 2026; far past; far future; overlapping entries |
| Combination | Multiple simultaneous failures | Fails R1 and R3: `violated_rule_ids` equals both IDs, sorted; passes all: empty |
| Activation | Sandbox vs calendar | Calendar mode, Rule 3 inactive before its month; sandbox mode ignores `introduced_month` |
| Conflict (only once extensions are approved) | Precedence, supersession, exceptions, cycles | Higher-precedence permit overrides lower require; superseded rule absent from `results`; supersedes cycle rejected |
| Declared inputs | A check reads only fields in `applies_to` | Proxy-wrapped application throws on undeclared field access |
| Purity | Same inputs give same outputs; inputs not mutated | Deep-freeze fixtures; repeat call equality |
| Error paths | `NO_ELECTION_CONFIGURED`, `OVERLAPPING_CALENDAR_ENTRIES`, bad rule config | Must return `ok: false`, never throw, never guess |
| Generator ground truth (property) | See below | N seeds per profile |
| Save/migration | Each migration step on stored fixtures | v1 fixture migrates; unknown future version refuses to load without deleting data |

Generator ground-truth property test: for many seeds (for example 1,000 per intent profile), generate an applicant with an intended outcome (approve, or deny with a specific set of violated rules). Run the engine. Assert the engine's verdict and `violated_rule_ids` equal the intent. A mismatch means the generator or a rule is wrong. Also assert that generated applications are well formed (no impossible dates, required fields present) and that the same seed yields byte-identical applications. At runtime the engine's answer is the ground truth, never the generator's intent.

### 3.10 Rule set and module layout (sketch, nothing scaffolded)

```
src/
  engine/          pure: types, evaluate, interpreter, calendar lookup   (no UI imports)
  rules/           data: r1_age, r2_residency, r3_citizenship, index
  data/            calendar.json, shifts.json, narrative.json (B8), economy.json
  gen/             seeded PRNG, applicant generator, perturbers            (pure)
  save/            schema, migrations, localStorage adapter
  ui/              DOM/CSS rendering, desk items, stamps, audio
tests/             Vitest: engine, rules, gen, save
```

An import-boundary test (or lint rule) fails the build if anything under `engine/`, `rules/`, or `gen/` imports from `ui/` or touches `window`/`document`.

### 3.11 Part B forward-compatibility (summary only, not designed here)

| Part B item | Engine or data features it will need | MVP hook already present |
|---|---|---|
| B1 Prior registration: not registered in another state; listing a prior address cancels it; prior info can update an SD registration (name change, in-state move). Certification under penalty of perjury (citizen; 18 by next election; SD resident; not judged mentally incompetent; not currently serving a felony sentence; authorizes cancellation of previous registration). Overseas citizens (citizen or spouse last domiciled in SD immediately before leaving the US; no domicile/registration/voting elsewhere; otherwise qualified; absentee in last-resided county/precinct). | New optional `Application` sections (`prior_registration`, `certification`, `overseas`); rules whose `applies_to` targets those sections and return `not_applicable` when the section is absent; application variants (overseas) selecting a different rule subset; a verdict that can carry side-effect actions (cancel prior registration, update existing record) beyond approve/deny; boolean attestation fields on a certification document | `not_applicable` result; `applies_to`; optional application sections; verdict object is extensible |
| B2 Citizenship rules introduced all at once in the March 2026 to April 2026 shift | Several rules sharing one `introduced_month`; calendar activation mode | `introduced_month`; `"calendar"` mode |
| B3 Progression: Oct 2025 to Nov 2025 start with ID and residency; Feb to Mar 2026 newspaper appears; Mar to Apr 2026 citizenship. Rules later combine, conflict, occasionally contradict; each briefing introduces one new component. | Shift table driving `shift_date` and mode; briefing built from the diff of active rules between consecutive shifts; the optional conflict extensions (3.8); a calendar that extends past June 23, 2026 (otherwise `NO_ELECTION_CONFIGURED`) | `shifts.json`; extension fields specified; explicit no-election error |
| B5 Newspaper | Presentation only; reads date from state. No engine involvement. Copy is not written in this document. | Narrative file (B8) |
| B6 Family expenses and moral pressure | Economy ledger with recurring debits; save fields for balance and obligations | Economy section; save v1 has `economy` object |
| B7 Shutter, fade, tick, versioned saves | Transition state machine in UI; save migrations | Save v1 versioned (sections 6.4 and 6.5) |
| B8 All narrative text in a single data file | `narrative.json` keyed by id; engine and rules reference text by key only for non-error strings | `error_message` stays in the rule entry; briefing and all other copy go in the narrative file from the MVP onward |
| B10 Accessibility: readable text, full keyboard navigation, colorblind-safe stamps | Every interaction reachable by keyboard; stamps distinguished by shape and label, not color alone; text scaling | Required from MVP UI (section 7.5) |
| B12 Final "Recount" ending using a ledger of the player's June 2026 citizenship-rule denials | A per-decision log: date, application id, player decision, engine verdict, violated rule IDs, so that denials under specific rules in a date range can be queried | `decision_log` is part of save v1 (section 6.4) so the data exists from the first save. No ending copy is written here. |

---

## 4. The three MVP rules

In the shipped game Rules 1 and 2 are active from October 2025 and Rule 3 from April 2026 (calendar mode). During MVP development all three can be exercised together in sandbox mode (3.5). All `source.citation` fields are UNSOURCED pending owner verification; the owner's brief says "verify citation" for Rules 1 and 2 and supplies Rule 3's wording as given. All three: `verified: false`.

### 4.1 Rule 1: Age (`R1_AGE`)

```yaml
id: R1_AGE
introduced_month: "2025-10"
applies_to: [application.id_document.birth_date, application.declared_birth_date,
             application.citizenship_documents[].birth_date]
check: "eligible iff birth_date <= date_minus_years(next_election.election_date, 18)
        AND all present birth dates agree (see integrity note)"
error_message: "Date of birth: {condition}."
source: { citation: "UNSOURCED (owner: South Dakota codified law, verify citation)" }
verified: false
```

Condition strings (neutral, procedural; returned in `CheckResult.details.condition` and substituted into `{condition}`):

- "below eligibility date for the next election ({next_election_date})"
- "differs between documents"

Owner requirement: must be 18 or older by the next election (looked up from the calendar by in-game date). A 17-year-old who will turn 18 on or before that election is eligible.

Precise check specification:

1. `E = calendar_lookup(as_of).election_date`. If no entry, the engine returns `NO_ELECTION_CONFIGURED` for the whole evaluation (not a rule failure).
2. `cutoff = E` with the year decreased by 18 (same month and day).
3. Eligible iff `birth_date <= cutoff`, compared as (year, month, day) tuples. Equality passes: a person who turns 18 on election day is "18 by the election" (PROPOSAL, flagged Q11).
4. Worked examples with the current table: next election June 2, 2026 gives cutoff 2008-06-02. Born 2008-06-02 passes. Born 2008-06-03 fails. For a shift dated on or after June 2, 2026 and before June 23, 2026 the election is June 23, 2026, so the cutoff is 2008-06-23.
5. Which birth date is compared: the date on the identity document. The form's declared date and any other document's date must match it; a mismatch is reported under this rule (integrity note below).

Feb 29 policy (PROPOSAL, needs owner decision, Q11):

- Step 2 can yield an invalid date only when `E` is Feb 29. In that case use Feb 28 of the target year if that year is not a leap year. No current calendar entry is on Feb 29.
- A person born on Feb 29 is compared literally as the tuple (Y, 2, 29). Consequence: against a cutoff of Feb 28 of a non-leap year, they have not yet reached 18; against a cutoff of Mar 1 or later they have. This is equivalent to treating their birthday as Mar 1 in non-leap years. The alternative (birthday treated as Feb 28) is not adopted by default.
- Tests include Feb 29 births against cutoffs on Feb 28, Mar 1, and a leap-year Feb 29.

Integrity note (PROPOSAL, Q14): A5 lists mismatched names, addresses, and dates as discrepancies, but the owner defined only three rules. This draft folds consistency into each rule rather than adding a fourth rule: R1 covers birth-date agreement, R2 covers address agreement, R3 covers name agreement on the qualifying citizenship document. The alternative is a fourth `R0_CONSISTENCY` rule, which needs owner approval since the brief says three MVP rules.

### 4.2 Rule 2: Residency (`R2_RESIDENCY`)

```yaml
id: R2_RESIDENCY
introduced_month: "2025-10"
applies_to: [application.residency_declaration.address_state,
             application.residency_declaration.address_line,
             application.residency_declaration.address_city,
             application.residency_declaration.address_postal,
             application.residency_declaration.address_is_po_box,
             application.id_document.address_state,
             application.id_document.address_line,
             application.id_document.address_city,
             application.id_document.address_postal,
             application.id_document.address_is_po_box]
check: "residency_declaration.address_state == 'SD' AND address_line non-empty
        AND address agreement with id_document (street-vs-street must match after
        normalization; if the declaration is a PO box, state agreement only; see below)"
error_message: "Residency declaration: {condition}."
source: { citation: "UNSOURCED (owner: SD codified law, verify citation)" }
verified: false
```

Condition strings:

- "address state is not South Dakota"
- "no address listed"
- "address differs between documents"

Owner requirement: must reside in South Dakota and list a South Dakota address. PO box addresses appear in the data.

Address agreement and PO box default (PROPOSAL, flagged Q6):

1. When both the residency declaration and the ID list street addresses, they must match after normalization (case-folded, whitespace collapsed, punctuation removed, common street-suffix abbreviations expanded). Otherwise the condition is "address differs between documents". This is what lets the A5 "mismatched addresses" discrepancy be caught.
2. When the declaration lists an SD PO box, only the state must agree with the ID's address state; the strings are not compared. The same applies if the ID, rather than the declaration, lists the PO box.
3. An SD-state PO box otherwise passes R2.

Reason: the owner's rule text as given asks for "a South Dakota address" and states no street-address requirement, and the brief says PO boxes appear in the data. These are defaults for the owner to confirm or reverse; reversing (3) is one clause in the check plus tests.

Subtly reflecting that the "usually sleeps at least 30 consecutive days per year in South Dakota" requirement is not enforced in practice (no lesson stated):

- The residency declaration form has no field for nights, days, or duration. The form is a name, an address, a state, and a signature line.
- The auditor's desk has no instrument for it: the inspection tools (magnifier, date lookup, election display, rule letter) have nothing that could check it.
- Neither the stamp reasons nor the error messages ever mention it, and no applicant is ever generated as failing it, so the engine has no condition for it.
- Open question Q7 asks whether the briefing letter should quote the 30-day clause verbatim (once the statutory text is verified). If quoted, the absence of any form field or tool is what the player notices. If not quoted, the game simply never raises it. Either way, no sentence in the game comments on the gap.
- Some applicants have PO box addresses, out-of-state-looking but SD-stated addresses, or addresses in different towns on different documents. The player's tools can compare strings only.

### 4.3 Rule 3: Proof of citizenship (`R3_CITIZENSHIP`)

```yaml
id: R3_CITIZENSHIP
introduced_month: "2026-04"   # citizenship enforced from April 2026 in the shipped game (owner decision, Q1); sandbox mode ignores it
applies_to: [application.citizenship_documents[].type, .is_photocopy, .issue_date,
             .expiry_date, .issuing_jurisdiction, .citizenship_verified_marker,
             .federal_listed, .name, application.applicant_name]
check: "see tiered predicate below"
error_message: "Citizenship documentation: {condition}."
source: { citation: "SB 175 (2026 session), as quoted by owner; section number UNSOURCED" }
verified: false
```

Condition strings:

- "no qualifying document presented"
- "photocopy presented where original required"
- "name differs between documents"
- "document expired"

Statutory wording as given by the owner (unverified): the applicant must show the auditor ONE of the following, with no photocopies:

- a South Dakota driver's license issued after July 1, 2025;
- a driver's license or nondriver ID from another state indicating citizenship has been verified;
- a tribal identification card.

Alternatively the applicant may provide a photocopy of one of: a birth certificate; a U.S. passport; a consular report of birth abroad issued by the U.S. Department of State; a certificate of naturalization; any other documentation permitted under the applicable federal provision.

Check specification (pure; N is the normalized applicant name; D is `as_of`):

```
name_ok(d)   := name_matches(d.name, N)
unexpired(d) := d.expiry_date == null || d.expiry_date >= D       // Q8

tier1(d) :=
     d.is_photocopy == false
  && name_ok(d)
  && unexpired(d)
  && (
        ( d.type == "sd_drivers_license"
          && d.issuing_jurisdiction == "SD"
          && d.issue_date > "2025-07-01" )                        // strictly after (Q2)
     || ( (d.type == "other_state_drivers_license"
           || d.type == "other_state_nondriver_id")
          && d.issuing_jurisdiction != "SD"
          && d.citizenship_verified_marker == true )              // Q5
     || ( d.type == "tribal_id"
          && d.issuing_jurisdiction startsWith "tribe:" )         // Q5
     )

// Originals and photocopies are both accepted for tier 2 by default (Q3),
// so is_photocopy is deliberately not tested here.
tier2(d) :=
     name_ok(d)
  && (
        ( d.type in { birth_certificate, us_passport,
                      consular_report_of_birth_abroad,
                      certificate_of_naturalization } )
     || ( d.type == "other_federal_documentation"
          && d.federal_listed == true )                           // Q9
     )

R3 passes iff  exists d in application.citizenship_documents : tier1(d) || tier2(d)
```

Condition selection when R3 fails (first match wins, for the document closest to qualifying): a photocopy of a tier-1 type gives "photocopy presented where original required"; an otherwise qualifying document with a non-matching name gives "name differs between documents"; an otherwise qualifying expired tier-1 document gives "document expired"; anything else gives "no qualifying document presented".

Constants (`2025-07-01`, the tier lists) live in the rule entry's data, not in engine code.

Important consequence for gameplay (not stated in-game): a South Dakota license issued on or before the cutoff date does not satisfy tier 1; the applicant must supply a different document. This arises purely from the check and is left for the player to notice.

Ambiguities surfaced as Open Questions, not silently resolved. The defaults above are PROPOSALS that make the engine well defined; each is isolated in a constant or a clause so it is a one-line change:

| Ref | Ambiguity | Default used in this draft |
|---|---|---|
| Q2 | "issued after July 1, 2025": strictly after, or on-or-after? | Strictly after (`issue_date > 2025-07-01`) |
| Q3 | The text says the applicant "may provide a photocopy" of tier-2 documents. Is an ORIGINAL tier-2 document (e.g., an original passport) acceptable? | Accepted (original or photocopy) |
| Q5 | What makes a tribal ID valid: any tribe? Expiry? | Any fictional tribe key `tribe:*`; expiry per Q8 |
| Q5 | What counts as "indicating citizenship has been verified" on an out-of-state ID? | Boolean `citizenship_verified_marker == true`; rendered as a small printed marker on the card |
| Q8 | Does an expired document qualify? (A5 lists expired dates as a discrepancy; the quoted statute text is silent.) | Expired tier-1 documents fail; tier-2 documents carry no expiry in the data and are unaffected |
| Q9 | How is "any other documentation permitted under the applicable federal provision" represented in-game? | `other_federal_documentation` with `federal_listed: true`, where membership comes from a closed placeholder list in data. The list contents are UNSOURCED; its provenance depends on the 42 C.F.R. question below. |

Federal cross-reference: the owner's note says the federal reference appears to be a Medicaid regulation (42 C.F.R. § 436.407) rather than a voter registration rule. This draft does not confirm or correct that. Candidate citation: UNSOURCED. It is on the verification checklist. Until resolved, `other_federal_documentation` items are included in the data model but should be generated rarely and with generic labels.

### 4.4 MVP rule summary

| Rule | `introduced_month` | MVP mode | `verified` |
|---|---|---|---|
| `R1_AGE` | 2025-10 | active (sandbox and calendar) | false |
| `R2_RESIDENCY` | 2025-10 | active (sandbox and calendar) | false |
| `R3_CITIZENSHIP` | 2026-04 | active (sandbox); from April 2026 in calendar mode | false |

---

## 5. Election calendar table

Data file `calendar.json`. Rules, notes, and in-game displays (including the desk's analog "Next election" display) read from it. No election date appears in rule code.

| In-game date range | Next election | Label | `verified` |
|---|---|---|---|
| Before June 2, 2026 | June 2, 2026 | statewide primary and municipal election | false |
| June 2, 2026 to June 23, 2026 | June 23, 2026 | runoff | false |

```json
[
  { "from": null,         "to": "2026-06-02", "election_date": "2026-06-02", "label": "statewide primary and municipal election", "verified": false },
  { "from": "2026-06-02", "to": "2026-06-23", "election_date": "2026-06-23", "label": "runoff",             "verified": false }
]
```

Interval convention (PROPOSAL): `from` inclusive, `to` exclusive, so June 2, 2026 falls in the second row, matching the owner's table where "June 2 to June 23" begins on June 2. Whether June 23 itself should still show June 23 as the next election, or fall through to "no election configured", is flagged in Q12. A shift dated on or after June 23, 2026 currently has no entry and the engine returns `NO_ELECTION_CONFIGURED`.

Per owner instruction, no November 3, 2026 general election entry exists in the table. Whether to add one is Open Question Q15.

The election display on the desk reads: "Next election: <label>, <date>" (for example "Next election: statewide primary and municipal election, June 2, 2026"). Label text comes from the calendar entry.

---

## 6. Economy with proposed numbers

All numbers are PROPOSALS, chosen as original values, not derived from any other game. Family expenses and moral pressure are out of scope for Step 1. Currency is plain dollars, shown as a running balance. Values live in `economy.json`.

### 6.1 Proposed values

| Parameter | Proposed value | One-line rationale |
|---|---|---|
| Income per correct decision | $7 | Small whole number; a 5-to-10 application shift yields $35 to $70 so progress is visible but modest. |
| Penalty per error in a shift | -$12 | Larger than income so a mistake outweighs a good decision, without wiping out a shift's earnings in one slip. |
| Error limit per shift | 3 | Owner-specified. |
| Earnings on three-error restart | Forfeited: balance returns to its value at shift start | Makes the restart a clean retry and keeps a failed attempt from being profitable; consistent with the shift not advancing. |
| Penalties on restart | Discarded along with earnings | Restart restores the shift-start balance exactly, avoiding compounding punishment during retries. |
| Starting balance | $0 | No expenses yet in Step 1, so no buffer needed. |
| Minimum balance | $0 floor (balance cannot display below zero in the MVP) | Avoids negative-balance states that only matter once expenses (B6) exist. |
| Bonus / streak mechanics | None | Keeps the economy legible and original. |

### 6.2 Worked example (7 applications)

- 7 correct: +$49, balance $49.
- 6 correct, 1 error: +$42 - $12 = $30.
- 3 errors before the end: shift restarts; balance returns to the shift-start value.

### 6.3 Open items

- Whether a finished shift with errors keeps its penalties (default: yes, they are deducted from the shift's net). Whether restart forfeiture is too harsh is a playtest question, not a legal one.
- Currency symbol and presentation are cosmetic and open.

### 6.4 Save format v1 (versioned schema)

Stored in `localStorage` under a single namespaced key, for example `tors.save`. The schema version is a field inside the payload.

```ts
interface SaveV1 {
  schema_version: 1;
  save_salt: string;                   // seeds deterministic generation (2.4)
  created_at: string;                  // ISO timestamp, informational only
  progress: {
    current_shift_id: string;          // next shift to play
    completed_shift_ids: string[];
    attempt_number: number;            // restarts of current shift
  };
  economy: {
    balance: number;
    balance_at_shift_start: number;    // used to restore on restart
  };
  settings: {
    text_scale: number;                // accessibility (B10)
    audio_volume: number;
    reduced_motion: boolean;
  };
  desk_layout: Record<string, { x: number; y: number }>;  // movable desk items, including flag
  decision_log: Array<{                // supports B12; also useful for debugging
    shift_id: string;
    application_id: string;
    as_of: string;                     // ISO date
    player_decision: "approve" | "deny";
    engine_verdict: "approve" | "deny";
    violated_rule_ids: string[];
    attempt_number: number;
  }>;
  flags: Record<string, boolean>;      // reserved for future progression flags
}
```

Rules for the save layer:

- Every load reads `schema_version` first. A version newer than the app supports is refused with a neutral message and the stored data is left untouched (never overwritten).
- Migrations are pure functions `migrate_n_to_n+1(old) => new`, applied in order, covered by fixtures of every historical version.
- All reads and writes are wrapped in try/catch; the game runs, without saving, if storage is unavailable.
- The save never stores rule definitions or calendar data, only IDs and results, so rule changes cannot corrupt saves.

### 6.5 Migration list

| From | To | Change | Status |
|---|---|---|---|
| (none) | v1 | Initial schema above | MVP |
| v1 | v2 | PLANNED: add `month_progress` (current in-game date as ISO, months advanced) for Part B progression | Future |
| v2 | v3 | PLANNED: add `family` and `obligations` for expenses (B6); add `seen_briefings` | Future |
| v3 | v4 | PLANNED: add `ledger_view_state` for recount ending (B12), if the decision log needs a derived index | Future |

Future entries are placeholders that show the migration mechanism, not commitments.

---

## 7. Art and audio direction (MVP subset)

### 7.1 Palette

Civic palette "in the spirit of" the City of Montgomery, Alabama's palette. Colors only. No image, asset, or logo from that source is used. The hex values below are ORIGINAL PICKS by the drafter and are not claimed to be any official color; variation is acceptable.

| Role | Hex (original pick) | Note |
|---|---|---|
| Civic navy | `#1F3A5F` | Booth frame, headers |
| Brick red | `#8C2F2B` | DENY stamp, warnings |
| Muted gold | `#C9A227` | Seal accent, small highlights |
| Paper cream | `#EDE6D3` | Document stock |
| Ink black | `#1B1B1B` | Typewriter text |
| Desk green-grey | `#4A5A4E` | Desk surface |
| Approve green-teal | `#2F6B5E` | APPROVE stamp (also marked by shape and label, see 7.5) |

No claim is made that any of these match a source palette. The verification checklist lists the inspiration claim itself (palette resemblance is the owner's intent; no hex mapping is asserted).

### 7.2 Look and feel

- Texture: somewhat grainy. Implementation: a procedurally generated noise layer (CSS/SVG turbulence filter or a small canvas-generated tile) applied over desk and paper at low opacity. No scanned texture assets.
- Interface: stamp-and-ink, typewriter typography, cramped booth layout. Stamps are drawn as vector shapes with slight random rotation and ink-spread jitter. Typography: a monospace or typewriter-style face. Font choice is open; any font must be open-licensed and recorded in the manifest (section 9).
- Layout: a single fixed-ratio screen. Booth window at the top, desk surface below with documents, the briefing letter, the election display, and the stamps. Original arrangement, not copied from any existing game; layout wireframes are a later deliverable.
- Procedural portraits: generated from `portrait_seed` using simple parametric faces (shapes: head, hair, eyes, mouth) drawn in a limited palette. They are clearly stylized, not photographic, and not based on real people.
- Wall seal: an original fictionalized Minnehaha County seal designed from scratch as SVG. Concept (PROPOSAL): a double ring with the county name in the outer band and an abstract geometric centerpiece (for example, stacked horizontal bars and a radiating arc) in the muted gold on navy. The real county seal is not reproduced; the designer must not work from it as a reference, and the owner should check the finished seal for unintended resemblance.
- Desk flag: the official flag of Sioux Falls, SD, placed on the desk as a movable item like any other desk item. The source file status is in 7.3.

### 7.3 Desk flag status

The owner supplied the source page https://en.wikipedia.org/wiki/Flag_of_Sioux_Falls,_South_Dakota (Commons file `File:Flag_of_Sioux_Falls,_South_Dakota.svg`) and states the flag is reusable. The exact Commons license tag and any attribution requirement are not yet recorded, so `license_verified` is false (Q17). The file is not yet in the repository. Until the tag is recorded, the game uses a generic original placeholder pennant, labeled `placeholder` in the manifest. This document does not describe the flag's design or colors.

### 7.4 Audio (MVP)

Only original or licensed audio; every source goes in the manifest. Proposed approach is to generate everything procedurally with the Web Audio API so no third-party audio is needed:

| Sound | Method |
|---|---|
| Ambient hum | Low sine/sawtooth pair with a slow filter drift, low-pass filtered noise bed; looped |
| Stamp thud | Short enveloped low-frequency burst plus a brief noise transient; slight pitch randomization |
| Typewriter clicks | Very short band-passed noise bursts with randomized timing and gain |
| Month-advance tick (Part B) | A single short click; not in MVP |

No music in the MVP. A mute control and volume setting are required.

### 7.5 Accessibility seeds (B10, built in from the start)

- APPROVE and DENY stamps differ by shape and text label, not by color alone (colorblind-safe).
- Text is readable at default size and scalable via setting.
- Every action reachable by keyboard: tab order through desk items, key to approve, key to deny, keyboard-driven move of desk items (as an alternative to dragging).
- Reduced-motion setting disables stamp jitter and any shake.

---

## 8. Stack proposal with trade-offs

Proposed by the owner for the doc to confirm: TypeScript + Vite, DOM/CSS rendering, Vitest for the rule engine, static hosting. This section confirms the proposal against alternatives; the decision remains the owner's.

### 8.1 Fit assessment

| Concern | TypeScript + Vite + DOM/CSS | Phaser (canvas/WebGL) | Godot (web export) |
|---|---|---|---|
| Document-heavy UI (text, forms, stamps) | Native strength: real text, selection, layout, zoom | Text and layout must be built by hand | Good UI toolkit, but heavier |
| Drag-and-drop desk items | Pointer events plus CSS transforms; easy | Built-in input and display list | Built-in |
| Keyboard navigation and screen-reader support (B10) | Strongest: native focus order and ARIA | Weak: canvas is opaque to assistive tech | Weak to moderate on web |
| Pure rule engine and unit tests | Same language end to end; Vitest runs the engine directly | Same language, but engine must be kept separate from the scene code | Rule engine in GDScript or C#: tests need a different toolchain, and the engine is harder to keep UI-free |
| Textures, grain, shake, particles | Possible via CSS/SVG/canvas overlays; limited for heavy effects | Strength | Strength |
| Bundle size and load time | Small | Medium (library included) | Large (engine runtime in web export) |
| Hosting | Plain static files | Plain static files | Static files, with extra web-export hosting requirements (headers for some builds) |
| Save to localStorage | Direct | Direct | Via JS bridge |
| Learning curve for the project | Low for web developers | Medium | Medium to high |
| Risk | Complex animation requires discipline; many DOM nodes if overdone | Accessibility and text rendering effort | Load size; web export quirks; rule-engine purity harder to enforce |

### 8.2 Recommendation (for owner confirmation)

TypeScript + Vite + DOM/CSS + Vitest. Reasons: the game is mostly text and documents, accessibility needs (B10) favor real DOM, and the rule engine test requirement (A10) is simplest when engine and tests share a language and no engine runtime. Phaser would be preferable only if heavy particle or animation work were added; Godot only if the project later grows toward a larger, non-web game.

### 8.3 Constraints carried by the stack choice

- Desktop browser, mouse and keyboard. No mobile layout in the MVP.
- Static hosting only; no server, no accounts, no analytics in the MVP.
- Dependency discipline: runtime dependencies kept to a minimum (ideally none); each dependency's version pinned and license recorded in the manifest. This document does not install anything.

---

## 9. Asset manifest skeleton

Rule: all assets are original or pipeline-generated, except those explicitly named. This is a skeleton; no assets exist yet. Every `license_verified` is false.

| Asset ID | Type | Description | Source | Origin | License | `license_verified` | Status |
|---|---|---|---|---|---|---|---|
| `flag_sioux_falls` | image (SVG) | Sioux Falls flag for the desk | https://en.wikipedia.org/wiki/Flag_of_Sioux_Falls,_South_Dakota (Commons file File:Flag_of_Sioux_Falls,_South_Dakota.svg) | third-party (named exception) | Owner states reusable; Commons license tag not yet recorded | false | not yet in repo; placeholder in use until tag recorded |
| `flag_placeholder` | image (SVG) | Generic original pennant stand-in | Authored by project | original | Project owner's choice | false | planned |
| `seal_minnehaha_fictional` | image (SVG) | Original fictionalized county seal for the wall | Authored by project | original | Project owner's choice | false | planned |
| `portraits_procedural` | generator code | Parametric placeholder faces from `portrait_seed` | Project code | original | Project owner's choice | false | planned |
| `texture_grain` | generator code | Procedural noise texture | Project code | original | Project owner's choice | false | planned |
| `stamp_approve`, `stamp_deny` | image (SVG) | Vector stamps, distinct by shape and label | Authored by project | original | Project owner's choice | false | planned |
| `doc_templates` | image/CSS | Document card layouts (ID, declaration, certificates) | Authored by project | original | Project owner's choice | false | planned |
| `font_typewriter` | font | Typewriter-style face | TBD | open-licensed candidate TBD | TBD | false | font not chosen |
| `audio_hum` | audio (generated) | Ambient hum | Web Audio synthesis in project code | original | Project owner's choice | false | planned |
| `audio_stamp_thud` | audio (generated) | Stamp thud | Web Audio synthesis | original | Project owner's choice | false | planned |
| `audio_typewriter_click` | audio (generated) | Typewriter clicks | Web Audio synthesis | original | Project owner's choice | false | planned |
| `audio_tick` | audio (generated) | Single tick (Part B) | Web Audio synthesis | original | Project owner's choice | false | future |
| `palette_tokens` | CSS tokens | Section 7.1 colors | Original picks | original | n/a | false | planned |

Manifest fields for each real asset when added: id, file path, type, source URL or tool, author, license name and link, date acquired, date license checked, who checked, `license_verified`, and notes (for example "attribution required").

---

## 10. Verification checklist

Every item below is `verified: false`. Only the owner may change that. "Source given" is where the claim came from in the owner's brief. "Candidate source" is a URL if one was found, else UNSOURCED. No web searches were run in round 0, so every candidate source reads UNSOURCED.

| # | Item | Claim as stated | Source given | Candidate source | Verified |
|---|---|---|---|---|---|
| 1 | Rule 1 citation | Must be 18 or older by the next election; 17-year-olds who turn 18 by that election are eligible | Owner brief ("SD codified law, verify citation") | UNSOURCED | false |
| 2 | Rule 2 citation | Must reside in SD and list an SD address | Owner brief ("SD codified law, verify citation") | UNSOURCED | false |
| 3 | Residency "30 consecutive days" claim | Residency standard involves usually sleeping at least 30 consecutive days per year in SD | Owner brief (as the standard the game subtly shows is unenforced) | UNSOURCED | false |
| 4 | "Not enforced in practice" claim | The 30-day requirement is not enforced in practice | Owner brief | UNSOURCED | false |
| 5 | Rule 3 / SB 175 statutory text | The three tier-1 items and five tier-2 items as quoted in 4.3 | Owner-supplied quote "as enacted by SB 175, 2026 session" | UNSOURCED | false |
| 6 | SB 175 identity | SB 175 is the 2026 South Dakota SAVE Act | Owner brief | UNSOURCED | false |
| 7 | SB 175 section number in SD code | Citation slot for Rule 3 | Not given | UNSOURCED | false |
| 8 | July 1, 2025 cutoff | SD driver's license "issued after July 1, 2025" | Owner-supplied quote | UNSOURCED | false |
| 9 | July 1, 2025: strict vs inclusive | "after" means strictly after | Drafter default | UNSOURCED | false |
| 10 | 42 C.F.R. 436.407 cross-reference | Federal provision for "other documentation" appears to be this Medicaid regulation, not a voter registration rule | Owner note (flagged as uncertain) | UNSOURCED | false |
| 11 | Correct federal citation | The right federal reference for "applicable federal provision" is undetermined | Owner brief | UNSOURCED | false |
| 12 | Tribal ID validity | Any tribe's ID qualifies; expiry treatment | Drafter default | UNSOURCED | false |
| 13 | Out-of-state ID marker | What "indicating citizenship has been verified" looks like | Drafter default | UNSOURCED | false |
| 14 | Tier-2 originals | Original (non-photocopy) tier-2 documents are accepted | Drafter default | UNSOURCED | false |
| 15 | Expired documents | Expired tier-1 documents do not qualify | Drafter default | UNSOURCED | false |
| 16 | PO box acceptance | An SD PO box address satisfies the SD-address requirement | Drafter default | UNSOURCED | false |
| 17 | Age cutoff inclusivity | Turning 18 on election day counts as 18 by the election | Drafter default | UNSOURCED | false |
| 18 | Feb 29 birthday handling | Treated as Mar 1 in non-leap years for the age comparison | Drafter proposal | UNSOURCED | false |
| 19 | Calendar entry 1: date | June 2, 2026 election | Owner brief | UNSOURCED | false |
| 20 | Calendar entry 1: label | June 2, 2026 is a statewide primary and municipal election | Owner-stated; source not yet recorded | UNSOURCED | false |
| 21 | Calendar entry 1: range | Applies before June 2, 2026 | Owner brief | UNSOURCED | false |
| 22 | Calendar entry 2: date | June 23, 2026 election | Owner brief | UNSOURCED | false |
| 23 | Calendar entry 2: label | June 23, 2026 is a runoff | Owner brief | UNSOURCED | false |
| 24 | Calendar entry 2: range | Applies June 2 to June 23, 2026 | Owner brief | UNSOURCED | false |
| 25 | Nov 3, 2026 general election | Not in table; proposed only in Open Questions | Owner instruction | UNSOURCED | false |
| 26 | Start date of game | October 2025 | Owner brief | n/a (design choice) | false |
| 27 | Governor name (Part B) | Larry Rhoden is the governor | Owner brief (owner-given) | UNSOURCED | false |
| 28 | Signing date (Part B) | SB 175 signed March 26, 2026 | Owner brief (owner-given) | UNSOURCED | false |
| 29 | Newspaper date (Part B) | March 26, 2026 (newspaper dateline) | Owner brief (owner-given) | UNSOURCED | false |
| 30 | B12 runoff: election-night margin | Two-vote margin on election night | Owner brief (owner-given) | UNSOURCED | false |
| 31 | B12 runoff: recount margin | Four-vote margin after the recount | Owner brief (owner-given) | UNSOURCED | false |
| 32 | B12 runoff: winner | Identity of the winner | Not supplied by owner | UNSOURCED | false |
| 33 | Sioux Falls mayoral runoff (owner-given) | Sioux Falls mayoral runoff, June 23, 2026, decided by four votes after the recount, following a two-vote margin on election night | Owner brief (B12) | UNSOURCED | false |
| 34 | B12 title card source | Title card must cite official canvass results | Owner brief (B12); citation not yet supplied | UNSOURCED | false |
| 35 | Newspaper sidebar premise | County auditors said the new law will cause "chaos" | Owner brief (B5 sidebar) | UNSOURCED | false |
| 36 | Dakota Scout / Dakota Snout | Dakota Scout is a real South Dakota outlet that the Dakota Snout parodies (owner-given) | Owner brief (B5) | UNSOURCED | false |
| 37 | Desk flag: source file | Flag image from https://en.wikipedia.org/wiki/Flag_of_Sioux_Falls,_South_Dakota (Commons file File:Flag_of_Sioux_Falls,_South_Dakota.svg) | Owner-supplied page | Same URL; license tag not yet recorded | false |
| 38 | Desk flag: license | Owner states the flag is reusable; exact Commons license tag and attribution requirement not yet recorded | Owner statement | UNSOURCED (tag to be read from the Commons file page) | false |
| 39 | Desk flag: identity | The file shows the official Sioux Falls flag | Owner brief | UNSOURCED | false |
| 40 | Palette inspiration | Palette is in the spirit of the City of Montgomery, Alabama | Owner brief | UNSOURCED (no hex mapping asserted) | false |
| 41 | Jurisdiction | Minnehaha County, SD voter registration is handled by a county auditor | Owner brief | UNSOURCED | false |
| 42 | Auditor role in registration | The county auditor reviews registration applications at a service window | Owner brief premise | UNSOURCED | false |
| 43 | Briefing letter header | "Office of the South Dakota Secretary of State" as the sender | Owner brief | UNSOURCED | false |
| 44 | B1 certification items | Citizen; 18 by next election; SD resident; not judged mentally incompetent; not serving a felony sentence; authorizes cancellation of prior registration | Owner brief | UNSOURCED | false |
| 45 | B1 overseas-citizen provisions | As summarized in 3.11 | Owner brief | UNSOURCED | false |
| 46 | B1 prior-registration provisions | Not registered in another state; listing a prior address cancels it; prior info can update an SD registration | Owner brief | UNSOURCED | false |
| 47 | Real-world effects being satirized | The "real-world effects" of SB 175 and related rules on SD residents | Owner brief | UNSOURCED | false |
| 48 | Candidate citations added by drafter | None added in round 0 | n/a | n/a | false |

Items in this table are claims the game may rely on or imply. The jurisdiction, auditor-role, and real-world-effects rows are listed because the document cannot trace them to a source. The B12 winner row is intentionally unfilled (not supplied by owner); the drafter does not invent it.

---

## 11. Open questions

Numbered sequentially. Items marked (REQUIRED) were mandated for inclusion.

### Rules and data

1. **Rule 3 timing. RESOLVED (owner decision).** In the shipped game, citizenship is enforced from April 2026 (calendar mode; `R3_CITIZENSHIP` has `introduced_month: "2026-04"`). Sandbox mode stays as a dev/test mode so each regulation can be tested in practice without playing through the whole game; it is not part of the shipped progression. PROPOSAL (needs owner approval): sandbox lets the tester pick which rules are active and the `as_of` date.
2. **"Issued after July 1, 2025."** Strictly after, or on-or-after? Default: strictly after.
3. **Original tier-2 documents.** The text says the applicant "may provide a photocopy" of a birth certificate, passport, and so on. Is an ORIGINAL tier-2 document (e.g., an original passport) acceptable? Default: accepted.
4. **Shift dates.** Which in-game day-of-month does each shift use? The age cutoff and the calendar lookup both depend on it, and the display shows only month and year.
5. **Tribal ID and out-of-state markers.** What makes a tribal ID valid (any tribe? expiry?), and what exactly counts as "indicating citizenship has been verified" on an out-of-state ID?
6. **PO box and address agreement (REQUIRED).** Does a PO-box-only application pass Rule 2? Default: yes, provided the state is SD. Companion default: when both addresses are street addresses they must match after normalization; when the declaration (or ID) lists an SD PO box, only the state must agree. Confirm or reverse.
7. **30-day clause in the briefing letter.** Should the letter quote the "usually sleeps at least 30 consecutive days per year" language verbatim once verified, or omit it? Either way no text may comment on enforcement.
8. **Expired documents.** Do expired IDs fail Rule 3? Default: yes for tier 1 (A5 lists expiry as a discrepancy).
9. **"Other documentation permitted under the applicable federal provision."** How is this represented in-game? Default: a closed placeholder list in data with a `federal_listed` flag. The list contents are UNSOURCED and depend on resolving the 42 C.F.R. § 436.407 question.
10. **Restart behavior.** After three errors, does the shift replay identical applicants (default) or reshuffle?
11. **Age edge cases.** Is turning 18 on election day eligible (default: yes)? Feb 29 birthday policy (default: treated as Mar 1 in non-leap years)?
12. **Calendar boundaries.** Should a shift dated exactly June 23, 2026 show June 23 as next election, or fall through to "no election configured"? Currently the second range excludes June 23. Also confirm the June 2 boundary: the owner's table puts June 2 in the second row.
13. **Label for June 2, 2026. RESOLVED (owner-stated, still unverified against a source).** The owner says June 2, 2026 was also the statewide primary. The calendar label is now "statewide primary and municipal election", with `verified: false`.
14. **Consistency checks.** A5 lists mismatched names, addresses, and dates, but only three rules exist. Default folds these into R1, R2, R3. Alternative: a fourth consistency rule. Also confirm the name-matching policy (strict normalization, no nickname tolerance).

### Calendar and registration scope (REQUIRED)

15. **November 3, 2026 general election.** Should a November 3, 2026 general election entry be added to the calendar? Proposed but not added, per owner instruction. Without it, shifts dated on or after June 23, 2026 produce `NO_ELECTION_CONFIGURED`.
16. **Prior registration vs residency.** Should any part of the MVP use prior registration in place of residency (for example, accepting an existing SD registration as evidence of residency for in-state movers)? Default: no; the MVP uses the Rule 2 address check only, and prior registration is B1.

### Assets and licensing (REQUIRED)

17. **Desk flag license tag.** The owner supplied the source page https://en.wikipedia.org/wiki/Flag_of_Sioux_Falls,_South_Dakota (Commons file `File:Flag_of_Sioux_Falls,_South_Dakota.svg`) and states the flag is reusable. Please record the exact license tag shown on the Commons file page (for example a public-domain template or a CC license) and whether it requires attribution. The placeholder pennant stays only until that tag is recorded.

### Source text

18. **Section 15 reference. RESOLVED (Owner confirmed: B5).** The brief's "sidebar in the newspaper (Section 15)" means the B5 newspaper sidebar.

### Design risks (concise)

19. **Real names, legal review.** The parody uses a real county, a real governor name, and real municipal runoff margins. Should it get a legal review before public release? A satirical use can still imply false statements of fact if details are wrong.
20. **Causation reading.** Tying the B12 title card or "Recount" ending to a real election could be read as claiming the law caused the result, despite the "no causation" rule. Should the ending avoid real names, or present the numbers without implication? No copy is written here; the risk needs an owner decision before B12 is designed.
21. **Core-edit boundary.** A new operator for the check interpreter is a core edit (3.3). Is the escape hatch (a pure function in the rule file) acceptable as "data entry plus tests"?
22. **Conflict extensions.** Approve, modify, or reject the optional fields in 3.8 (`precedence`, `topic`, `effect`, `supersedes`, `retired_month`, `exceptions`), and in particular whether `permit` semantics are wanted at all.
23. **Tone check on the 30-day gap.** The subtle depiction of an unenforced requirement relies on the player noticing an absence. Is the owner comfortable that no text ever confirms it, even if some players never notice?
24. **Parody framing and employer separation.** The game must not read as an organizational statement. A neutral "personal project, non-commercial parody" credit line is suggested for the title screen; wording is an owner decision (and must not itself be editorial).
25. **Seal and flag as government symbols.** Even a fictional seal should not be mistakable for an official one. Should a visible "fictional" marker be used? The tone rules limit what text can say, so this needs a neutral wording decision.
26. **Applicant fairness in generation.** Fictional applicants must not be built from stereotypes of real groups. A review of name, tribe, and address generators is advised once they exist; tribal ID entries use fictional tribe keys in the draft.

---

## 12. Change log

| Date | Round | Author role | Change / approval | Open issues |
|---|---|---|---|---|
| 2026-10-26 | 0 | Sonnet drafter | Initial draft | Numbering, refs, R2/R3 spec issues |
| 2026-10-26 | 1 | Opus reviewer | Round 1 review: 10 required fixes; owner decisions on Rule 3 timing (April 2026 in game, sandbox for testing), flag image supplied, Section 15 -> B5 pending confirm | none |
| 2026-10-26 | 1 | Sonnet drafter | Revision per round 1, also covering three owner answers: Section 15 = B5, June 2 label, flag source page | Fix 3 not applied; R2 applies_to incomplete |
| 2026-10-26 | 2 | Opus reviewer | Round 2 review: 2 required fixes; owner answers on Section 15 (B5 confirmed), June 2 statewide primary, flag source URL | — |
| 2026-10-26 | 2 | Sonnet drafter | Revision per round 2 | none |
| 2026-10-26 | 3 | Opus reviewer | APPROVED for owner review. Step 1 deliverable complete; nothing marked verified | Owner items: Q2-Q12, Q14-Q17, Q19-Q26; Q6 extension (PO box on ID side) needs owner confirmation; all checklist rows await owner verification |
