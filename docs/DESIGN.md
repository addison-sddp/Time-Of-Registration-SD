# Time of Registration, SD: Design Document

Status: DRAFT, revision v2. Every rule, citation, date, and calendar entry is `verified: false` until the project owner changes it. The one exception is the desk flag license, which the owner verified on 2026-10-26 (transcribed by the drafter, section 9 and the checklist).

Conventions used throughout:

- "Owner" is the project owner. Only the owner may set any `verified` value to true.
- "(owner-given)" marks a fact taken from the owner's brief. It is still unverified.
- "PROPOSAL" marks a design choice made by the drafter that needs owner approval.
- "UNSOURCED" marks a real-world claim for which no source has been located. No web research has been performed, so the only candidate URLs are ones the owner supplied (the flag page, and the Searchlight article, which has NOT been read). "RESOLVED" marks an open question the owner has answered.

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

### 1.3 Names policy (binding)

Any character, outlet, or official reflecting a real person or entity gets an in-game name supplied by the owner. Builders must ask the owner for the name and must never invent one.

The B12 ending avoids real names (Q20). Real-name and parody risks the owner will review before public release are collected in section 13.

---

## 2. Shift and month structure, and the core loop

### 2.1 Structure

| Unit | Definition | MVP status |
|---|---|---|
| Shift | One level. One in-game day. Player clocks in in the morning and out in the evening. | In scope |
| Applications per shift | 5 to 10 (PROPOSAL: count drawn from the shift seed, see 2.4) | In scope |
| Shift count | 10 shifts in the full game (2.2); the game ends after the last | In scope |
| Time limit | None | In scope |
| Error limit | Three errors in a shift returns the player to the start of the same shift. The shift does not advance. | In scope |
| Month | Progression unit, displayed as "[Month] [Year]", starting at "October 2025" | Date display in scope; progression out of scope |
| Month advance | At end of a successful shift: window shutters, fade to black, single tick sound, date advances one month | Part B (B7), not MVP |

### 2.2 Shift dates and the shift table

The display shows only "[Month] [Year]". The election calendar (section 5) has day-level boundaries and the age rule needs a full election date, so every shift carries a full ISO `shift_date` internally. Owner decision (Q4): every shift is dated the first of the month, except the final shift, which is June 3, 2026.

| # | `shift_id` | `shift_date` | Displayed | Next election (from calendar, section 5) | Active rules in calendar mode |
|---|---|---|---|---|---|
| 1 | s01 | 2025-10-01 | October 2025 | June 2, 2026 | R1, R2 |
| 2 | s02 | 2025-11-01 | November 2025 | June 2, 2026 | R1, R2 |
| 3 | s03 | 2025-12-01 | December 2025 | June 2, 2026 | R1, R2 |
| 4 | s04 | 2026-01-01 | January 2026 | June 2, 2026 | R1, R2 |
| 5 | s05 | 2026-02-01 | February 2026 | June 2, 2026 | R1, R2 |
| 6 | s06 | 2026-03-01 | March 2026 | June 2, 2026 | R1, R2 |
| 7 | s07 | 2026-04-01 | April 2026 | June 2, 2026 | R1, R2, R3 |
| 8 | s08 | 2026-05-01 | May 2026 | June 2, 2026 | R1, R2, R3 |
| 9 | s09 | 2026-06-01 | June 2026 | June 2, 2026 (but see N1, Q27) | R1, R2, R3 |
| 10 | s10 | 2026-06-03 | June 2026 | June 23, 2026 | R1, R2, R3 |

The game ends after the June 3 shift: the ending cutscene plays, then the player returns to the main menu. No ending copy is written in this document. How the transition between the June 1 and June 3 shifts is presented (the displayed month does not change) is a Part B presentation detail.

PROPOSAL: shifts are defined in `shifts.json` with `{ shift_id, shift_date, scripted_applicants? }`. Every `shift_date` must have a calendar entry (validation test). The MVP can also run any shift in sandbox mode (3.5); the shipped progression uses calendar mode.

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
- Applicant content (who the applicants are, their documents, how many) is seeded by `hash(save_salt, shift_id)`. It is identical on every attempt of a shift.
- Applicant order is seeded by `hash(save_salt, shift_id, attempt_number)`. Restarting a shift after three errors replays the same applicants in a shuffled order (owner decision, Q10).
- An optional per-applicant `pinned_position` in the shift data (for example the person who leaves the newspaper) is never shuffled. The remaining applicants are shuffled into the remaining positions.
- Rationale: a restart is a retry of a known set, so tests are reproducible, while the shuffled order keeps a retry from being a memorized sequence.
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
  name: string | null;                       // as printed
  birth_date: ISODate | null;
  address_line: string | null;
  address_city: string | null;
  address_state: string | null;              // 2-letter code as printed
  address_postal: string | null;
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

- Addresses are plain text lines. A line may read like a PO box; the engine treats it as an ordinary address and has no PO box field or logic (owner decision, Q6).
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
| Per-rule | Each rule, boundary and negative cases, with fixture applications | R1: born exactly on cutoff date; one day after; birth-date mismatch between documents; R2: SD address, non-SD address, missing address, PO-box-styled SD address (passes); R3: each acceptable document type; each photocopy/original combination; expired tier 1 and tier 2; null expiry passes; `issue_date` of 2025-06-30, 2025-07-01, 2025-07-02; wrong issuer; name mismatch |
| Calendar | Lookup boundaries; gaps | `as_of` = each shift date in 2.2; June 1, June 2, June 3, June 22 2026; far past; a date past all entries (error); overlapping entries |
| Combination | Multiple simultaneous failures | Fails R1 and R3: `violated_rule_ids` equals both IDs, sorted; passes all: empty |
| Activation | Sandbox vs calendar | Calendar mode, Rule 3 inactive before its month; sandbox mode ignores `introduced_month` |
| Conflict (only once extensions are approved) | Precedence, supersession, exceptions, cycles | Higher-precedence permit overrides lower require; superseded rule absent from `results`; supersedes cycle rejected |
| Declared inputs | A check reads only fields in `applies_to` | Proxy-wrapped application throws on undeclared field access |
| Purity | Same inputs give same outputs; inputs not mutated | Deep-freeze fixtures; repeat call equality |
| Error paths | `NO_ELECTION_CONFIGURED`, `OVERLAPPING_CALENDAR_ENTRIES`, bad rule config | Must return `ok: false`, never throw, never guess |
| Generator ground truth (property) | See below | N seeds per profile |
| Generator invariants | Content set identical across attempts; order deterministic per `attempt_number` and different across attempts; `pinned_position` applicants never move; no Feb 29 birth dates in any generated document | Run attempts 1 to 5 of every shift |
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
| B3 Progression: Oct 2025 to Nov 2025 start with ID and residency; Feb to Mar 2026 newspaper appears; Mar to Apr 2026 citizenship. Rules later combine, conflict, occasionally contradict; each briefing introduces one new component. | Shift table driving `shift_date` and mode; briefing built from the diff of active rules between consecutive shifts; the optional conflict extensions (3.8); a calendar entry for every shift date (validated; the game ends after the June 3, 2026 shift) | `shifts.json`; extension fields specified; explicit no-election error |
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
3. Eligible iff `birth_date <= cutoff`, compared as (year, month, day) tuples. Equality passes: a person who turns 18 on election day is "18 by the election" (owner decision, Q11).
4. Worked examples with the current table: next election June 2, 2026 gives cutoff 2008-06-02. Born 2008-06-02 passes. Born 2008-06-03 fails. For the June 3, 2026 shift (a date on or after June 2 and before June 23, 2026) the election is June 23, 2026, so the cutoff is 2008-06-23.
5. Which birth date is compared: the date on the identity document. The form's declared date and any other document's date must match it; a mismatch is reported under this rule (integrity note below).

No Feb 29 (owner decision, Q11): the game contains no Feb 29 dates. The generator never produces Feb 29 birth dates, and no calendar entry falls on Feb 29. A generator test asserts that no generated document contains a Feb 29 date (3.9).

Integrity note (OPEN, Q14): A5 lists mismatched names, addresses, and dates as discrepancies, but only three rules exist. This draft folds consistency into the rules rather than adding a fourth: R1 covers birth-date agreement across documents, and R3 covers name agreement on the qualifying citizenship document. Address mismatches no longer count (Q6). Whether a name or birth-date mismatch should still be grounds to deny is asked in plain language in Q14.

### 4.2 Rule 2: Residency (`R2_RESIDENCY`)

```yaml
id: R2_RESIDENCY
introduced_month: "2025-10"
applies_to: [application.residency_declaration.address_state,
             application.residency_declaration.address_line]
check: "pass iff residency_declaration.address_line is non-empty
        AND residency_declaration.address_state == 'SD'"
error_message: "Residency declaration: {condition}."
source: { citation: "UNSOURCED (owner: SD codified law, verify citation)" }
verified: false
```

Condition strings:

- "address state is not South Dakota"
- "no address listed"

Owner requirement: must reside in South Dakota and list a South Dakota address. Owner decision (Q6): the PO box mechanic is dropped. R2 passes iff the residency declaration lists an address whose state is South Dakota, and fails otherwise. There is no address-agreement clause and no PO box logic. PO box style addresses may appear in generated data as ordinary SD addresses and pass like any other SD address.

Subtly reflecting that the "usually sleeps at least 30 consecutive days per year in South Dakota" requirement is not enforced in practice (no lesson stated):

- The residency declaration form has no field for nights, days, or duration. The form is a name, an address, a state, and a signature line.
- The auditor's desk has no instrument for it: the inspection tools (magnifier, date lookup, election display, rule letter) have nothing that could check it.
- Neither the stamp reasons nor the error messages ever mention it, and no applicant is ever generated as failing it, so the engine has no condition for it.
- The briefing letter does not quote the 30-day clause (owner decision, Q7). No sentence in the game comments on the gap.
- PO box style addresses appear in generated data and pass like any SD address.

### 4.3 Rule 3: Proof of citizenship (`R3_CITIZENSHIP`)

```yaml
id: R3_CITIZENSHIP
introduced_month: "2026-04"   # citizenship enforced from April 2026 in the shipped game (owner decision, Q1); sandbox mode ignores it
applies_to: [application.citizenship_documents[].type, .is_photocopy, .issue_date,
             .expiry_date, .issuing_jurisdiction, .citizenship_verified_marker,
             .name, application.applicant_name]
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

The final item is not modeled in the game (owner decision, Q9). The first tier-1 bullet is quoted as given; the game's reading of the date is on or after July 1, 2025 (owner decision, Q2).

Check specification (pure; N is the normalized applicant name; D is `as_of`):

```
name_ok(d)   := name_matches(d.name, N)
unexpired(d) := d.expiry_date == null || d.expiry_date >= D       // Q8: applies to both tiers

tier1(d) :=
     d.is_photocopy == false
  && name_ok(d)
  && unexpired(d)
  && (
        ( d.type == "sd_drivers_license"
          && d.issuing_jurisdiction == "SD"
          && d.issue_date >= "2025-07-01" )                       // on or after (Q2)
     || ( (d.type == "other_state_drivers_license"
           || d.type == "other_state_nondriver_id")
          && d.issuing_jurisdiction != "SD"
          && d.citizenship_verified_marker == true )              // Q5 (PENDING)
     || ( d.type == "tribal_id"
          && d.issuing_jurisdiction startsWith "tribe:" )         // Q5 (PENDING)
     )

// Originals and photocopies are both accepted for tier 2 (Q3),
// so is_photocopy is deliberately not tested here.
tier2(d) :=
     name_ok(d)
  && unexpired(d)
  && d.type in { birth_certificate, us_passport,
                 consular_report_of_birth_abroad, certificate_of_naturalization }

R3 passes iff  exists d in application.citizenship_documents : tier1(d) || tier2(d)
```

Documents without an expiry date (for example birth certificates) have `expiry_date: null` and pass `unexpired`.

Condition selection when R3 fails (first match wins, for the document closest to qualifying): a photocopy of a tier-1 type gives "photocopy presented where original required"; an otherwise qualifying document with a non-matching name gives "name differs between documents"; an otherwise qualifying expired document of either tier gives "document expired"; anything else gives "no qualifying document presented".

Constants (`2025-07-01`, the tier lists) live in the rule entry's data, not in engine code.

Important consequence for gameplay (not stated in-game): a South Dakota license issued before July 1, 2025 does not satisfy tier 1; the applicant must supply a different document. This arises purely from the check and is left for the player to notice.

Decisions and open points for Rule 3 (details in section 11):

| Ref | Point | Status and current treatment |
|---|---|---|
| Q2 | "Issued after July 1, 2025" | RESOLVED: on or after (`issue_date >= 2025-07-01`). Owner-stated rationale, unverified: the law requiring citizenship status to be displayed on SD licenses took effect July 1, 2025, so a license issued that day complies. |
| Q3 | Original tier-2 documents | RESOLVED: accepted. |
| Q5 | Tribal ID validity; what counts as "indicating citizenship has been verified" on an out-of-state ID | PENDING: owner-designated source (South Dakota Searchlight, https://southdakotasearchlight.com/2024/01/31/sd-legislature-native-american-voter-registration-tribal-identification/) not yet read; site blocked from build environment. Defaults stand: any fictional `tribe:*` key; `citizenship_verified_marker == true`. |
| Q8 | Expired documents | RESOLVED: expired documents satisfy no requirement, either tier; null expiry passes. |
| Q9 | "Any other documentation permitted under the applicable federal provision" | RESOLVED: not modeled; tier 2 is exactly four document types. |

Federal cross-reference: the owner's note says the federal reference appears to be a Medicaid regulation (42 C.F.R. § 436.407) rather than a voter registration rule. This draft does not confirm or correct that. Candidate citation: UNSOURCED. Per owner decision (Q9) it is out of scope for gameplay; the citation is still unverified and stays on the checklist.

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

Interval convention: `from` inclusive, `to` exclusive, so June 2, 2026 falls in the second row, matching the owner's table where "June 2 to June 23" begins on June 2. No shift is dated June 23 or later (2.2, Q12), and a date past every entry returns `NO_ELECTION_CONFIGURED`.

No November 3, 2026 general election entry exists: the game ends after the June 3, 2026 shift (owner decision, Q15).

Open (N1, Q27): whether "next election" should mean "next election still open for registration". Default: unchanged, so the June 1 shift shows June 2, 2026.

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
- The save stores `save_salt` and `attempt_number`. Applicant content and order are recomputed from them (2.4) and never stored, so a restart needs no extra fields.

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
- Desk flag: the official flag of Sioux Falls, SD, placed on the desk as a movable item like any other desk item. Source and license are in 7.3 and the manifest.

### 7.3 Desk flag status

Source page (owner-supplied): https://en.wikipedia.org/wiki/Flag_of_Sioux_Falls,_South_Dakota (Commons file `File:Flag_of_Sioux_Falls,_South_Dakota.svg`). The owner supplied the Commons permission notice, which reads: "This work has been released into the public domain by its author, Max Rabkin. This applies worldwide. In some countries this may not be legally possible; if so: Max Rabkin grants anyone the right to use this work for any purpose, without any conditions, unless such conditions are required by law."

The owner verified the license on 2026-10-26; the drafter only transcribed it. Status: approved for use, no attribution required. The placeholder pennant is no longer needed and is removed from the manifest. The SVG is committed to the repository once (under assets/, recorded in the manifest); the build never fetches it, because this environment's network policy blocks Wikimedia. One final-release check is listed in section 13 (whether the author's release covers the underlying flag design). This document does not describe the flag's design or colors.

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

Rule: all assets are original or pipeline-generated, except those explicitly named. This is a skeleton; no assets exist yet. Every `license_verified` is false except the desk flag, which the owner verified on 2026-10-26.

| Asset ID | Type | Description | Source | Origin | License | `license_verified` | Status |
|---|---|---|---|---|---|---|---|
| `flag_sioux_falls` | image (SVG) | Sioux Falls flag for the desk | https://en.wikipedia.org/wiki/Flag_of_Sioux_Falls,_South_Dakota (Commons file File:Flag_of_Sioux_Falls,_South_Dakota.svg) | third-party (named exception) | Public domain release by file author (Max Rabkin), per Commons permission notice; no attribution required | true (verified by owner, 2026-10-26) | approved for use; SVG to be committed to the repo |
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

Every item below is `verified: false` except the desk flag license row, which the owner verified on 2026-10-26. Only the owner may change a value. "Source given" is where the claim came from (the owner's brief or later owner answers). "Candidate source" is a URL if one exists, else UNSOURCED. The only URLs are ones the owner supplied; the Searchlight article has not been read.

| # | Item | Claim as stated | Source given | Candidate source | Verified |
|---|---|---|---|---|---|
| 1 | Rule 1 citation | Must be 18 or older by the next election; 17-year-olds who turn 18 by that election are eligible | Owner brief ("SD codified law, verify citation") | UNSOURCED | false |
| 2 | Rule 2 citation | Must reside in SD and list an SD address | Owner brief ("SD codified law, verify citation") | UNSOURCED | false |
| 3 | Residency "30 consecutive days" claim | Residency standard involves usually sleeping at least 30 consecutive days per year in SD | Owner brief (as the standard the game subtly shows is unenforced) | UNSOURCED | false |
| 4 | "Not enforced in practice" claim | The 30-day requirement is not enforced in practice | Owner brief | UNSOURCED | false |
| 5 | Rule 3 / SB 175 statutory text | The three tier-1 items and five tier-2 items as quoted in 4.3 (the fifth tier-2 item is not modeled in the game; owner decision, Q9) | Owner-supplied quote "as enacted by SB 175, 2026 session" | UNSOURCED | false |
| 6 | SB 175 identity | SB 175 is the 2026 South Dakota SAVE Act | Owner brief | UNSOURCED | false |
| 7 | SB 175 section number in SD code | Citation slot for Rule 3 | Not given | UNSOURCED | false |
| 8 | July 1, 2025 cutoff | SD driver's license "issued after July 1, 2025" | Owner-supplied quote | UNSOURCED | false |
| 9 | July 1, 2025: on or after | The game treats the cutoff as on or after July 1, 2025 (`issue_date >= 2025-07-01`) | Owner decision (Q2) | UNSOURCED | false |
| 10 | July 1, 2025 rationale | Owner-stated: the law requiring citizenship status to be displayed on SD licenses took effect July 1, 2025, so a license issued that day complies | Owner statement | UNSOURCED | false |
| 11 | 42 C.F.R. 436.407 cross-reference | Federal provision for "other documentation" appears to be this Medicaid regulation, not a voter registration rule. Out of scope for gameplay (owner decision); citation still unverified | Owner note (flagged as uncertain) | UNSOURCED | false |
| 12 | Correct federal citation | The right federal reference for "applicable federal provision" is undetermined. Out of scope for gameplay (owner decision); citation still unverified | Owner brief | UNSOURCED | false |
| 13 | Tribal ID validity | Any tribe's ID qualifies; expiry treatment (defaults pending the owner-designated source) | Drafter default | https://southdakotasearchlight.com/2024/01/31/sd-legislature-native-american-voter-registration-tribal-identification/ (owner-designated; NOT YET READ, site blocked from build environment) | false |
| 14 | Out-of-state ID marker | What "indicating citizenship has been verified" looks like (default pending the owner-designated source) | Drafter default | https://southdakotasearchlight.com/2024/01/31/sd-legislature-native-american-voter-registration-tribal-identification/ (owner-designated; NOT YET READ, site blocked from build environment) | false |
| 15 | Searchlight article (owner-designated source for tribal and out-of-state ID rules) | Content not known to the drafter; not summarized | Owner | https://southdakotasearchlight.com/2024/01/31/sd-legislature-native-american-voter-registration-tribal-identification/ (NOT YET READ) | false |
| 16 | Tier-2 originals | Original (non-photocopy) tier-2 documents are accepted | Owner decision (Q3) | UNSOURCED | false |
| 17 | Expired documents | Expired documents satisfy no documentation requirement (tier 1 and tier 2); a null expiry date passes | Owner decision (Q8) | UNSOURCED | false |
| 18 | PO box style addresses | An address written as a PO box passes Rule 2 like any SD address; no special handling | Owner decision (Q6) | UNSOURCED | false |
| 19 | Age cutoff inclusivity | Turning 18 on election day counts as 18 by the election | Owner decision (Q11) | UNSOURCED | false |
| 20 | No Feb 29 in game | The generator never produces Feb 29 birth dates; no calendar entry falls on Feb 29 | Owner decision (Q11) | n/a (design choice) | false |
| 21 | Calendar entry 1: date | June 2, 2026 election | Owner brief | UNSOURCED | false |
| 22 | Calendar entry 1: label | June 2, 2026 is a statewide primary and municipal election | Owner-stated; source not yet recorded | UNSOURCED | false |
| 23 | Calendar entry 1: range | Applies before June 2, 2026 | Owner brief | UNSOURCED | false |
| 24 | Calendar entry 2: date | June 23, 2026 election | Owner brief | UNSOURCED | false |
| 25 | Calendar entry 2: label | June 23, 2026 is a runoff | Owner brief | UNSOURCED | false |
| 26 | Calendar entry 2: range | Applies June 2 to June 23, 2026 | Owner brief | UNSOURCED | false |
| 27 | Registration deadline | Owner-stated: voter registration closes 15 days before an election (so June 8, 2026 for the June 23 runoff) | Owner statement | UNSOURCED | false |
| 28 | Nov 3, 2026 general election | Not in table; the game ends after the June 3, 2026 shift | Owner decision (Q15) | UNSOURCED | false |
| 29 | Start date of game | October 2025 | Owner brief | n/a (design choice) | false |
| 30 | Shift dates | First of each month from October 2025 through June 2026, plus a final shift on June 3, 2026 (10 shifts) | Owner decision (Q4) | n/a (design choice) | false |
| 31 | Governor name (Part B) | Larry Rhoden is the governor | Owner brief (owner-given) | UNSOURCED | false |
| 32 | Signing date (Part B) | SB 175 signed March 26, 2026 | Owner brief (owner-given) | UNSOURCED | false |
| 33 | SB 175 effective date | Effective date of SB 175 (N3) | Not given; manager inference only | UNSOURCED | false |
| 34 | Runoff registration | Whether new voters can register for the June 23 runoff, or only those registered for June 2 (N4) | Not given | UNSOURCED | false |
| 35 | Newspaper date (Part B) | March 26, 2026 (newspaper dateline) | Owner brief (owner-given) | UNSOURCED | false |
| 36 | B12 runoff: election-night margin | Two-vote margin on election night | Owner brief (owner-given) | UNSOURCED | false |
| 37 | B12 runoff: recount margin | Four-vote margin after the recount | Owner brief (owner-given) | UNSOURCED | false |
| 38 | B12 runoff: winner | Identity of the winner | Not supplied by owner | UNSOURCED | false |
| 39 | Sioux Falls mayoral runoff (owner-given) | Sioux Falls mayoral runoff, June 23, 2026, decided by four votes after the recount, following a two-vote margin on election night | Owner brief (B12) | UNSOURCED | false |
| 40 | B12 title card source | Title card must cite official canvass results | Owner brief (B12); citation not yet supplied | UNSOURCED | false |
| 41 | Newspaper sidebar premise | County auditors said the new law will cause "chaos" | Owner brief (B5 sidebar) | UNSOURCED | false |
| 42 | Dakota Scout / Dakota Snout | Dakota Scout is a real South Dakota outlet that the Dakota Snout parodies (owner-given) | Owner brief (B5) | UNSOURCED | false |
| 43 | Desk flag: source file | Flag image from https://en.wikipedia.org/wiki/Flag_of_Sioux_Falls,_South_Dakota (Commons file File:Flag_of_Sioux_Falls,_South_Dakota.svg) | Owner-supplied page | Same URL; license tag not yet recorded | false |
| 44 | Desk flag: license | Commons permission notice (text as supplied by owner): "This work has been released into the public domain by its author, Max Rabkin. This applies worldwide. In some countries this may not be legally possible; if so: Max Rabkin grants anyone the right to use this work for any purpose, without any conditions, unless such conditions are required by law." No attribution required | Owner (Commons permission notice) | Commons file page (owner-supplied) | true (verified by owner, 2026-10-26) |
| 45 | Desk flag: design coverage | Whether the file author's public-domain release covers the underlying flag design (final-release check, section 13) | Manager flag | UNSOURCED | false |
| 46 | Desk flag: identity | The file shows the official Sioux Falls flag | Owner brief | UNSOURCED | false |
| 47 | Palette inspiration | Palette is in the spirit of the City of Montgomery, Alabama | Owner brief | UNSOURCED (no hex mapping asserted) | false |
| 48 | Jurisdiction | Minnehaha County, SD voter registration is handled by a county auditor | Owner brief | UNSOURCED | false |
| 49 | Auditor role in registration | The county auditor reviews registration applications at a service window | Owner brief premise | UNSOURCED | false |
| 50 | Briefing letter header | "Office of the South Dakota Secretary of State" as the sender | Owner brief | UNSOURCED | false |
| 51 | B1 certification items | Citizen; 18 by next election; SD resident; not judged mentally incompetent; not serving a felony sentence; authorizes cancellation of prior registration | Owner brief | UNSOURCED | false |
| 52 | B1 overseas-citizen provisions | As summarized in 3.11 | Owner brief | UNSOURCED | false |
| 53 | B1 prior-registration provisions | Not registered in another state; listing a prior address cancels it; prior info can update an SD registration | Owner brief | UNSOURCED | false |
| 54 | Real-world effects being satirized | The "real-world effects" of SB 175 and related rules on SD residents | Owner brief | UNSOURCED | false |
| 55 | Candidate citations added by drafter | None; the only candidate URLs are owner-supplied (flag page, and the Searchlight article, which is not read) | n/a | n/a | false |

Items in this table are claims the game may rely on or imply. The jurisdiction, auditor-role, and real-world-effects rows are listed because the document cannot trace them to a source. The B12 winner row is intentionally unfilled (not supplied by owner); the drafter does not invent it.

---

## 11. Open questions

Numbered sequentially. Status tags: RESOLVED (owner answer recorded), PENDING, or OPEN. Owner-stated facts remain `verified: false` in the checklist unless noted there.

### Rules and data

1. **Rule 3 timing. RESOLVED (owner decision).** In the shipped game, citizenship is enforced from April 2026 (calendar mode; `R3_CITIZENSHIP` has `introduced_month: "2026-04"`). Sandbox mode stays as a dev/test mode so each regulation can be tested in practice without playing through the whole game; it is not part of the shipped progression. PROPOSAL (needs owner approval): sandbox lets the tester pick which rules are active and the `as_of` date.
2. **"Issued after July 1, 2025." RESOLVED (owner decision).** The cutoff is on or after July 1, 2025 (`issue_date >= "2025-07-01"`). Owner-stated rationale, unverified: the law requiring citizenship status to be displayed on SD licenses took effect July 1, 2025, so a license issued that day complies. Recorded as its own checklist row.
3. **Original tier-2 documents. RESOLVED (owner decision).** Original tier-2 documents (e.g., an original passport) are acceptable.
4. **Shift dates. RESOLVED (owner decision).** Every shift is dated the first of the month, except the final shift, which is June 3, 2026. Ten shifts: Oct 1 2025, Nov 1, Dec 1, Jan 1 2026, Feb 1, Mar 1, Apr 1, May 1, Jun 1, Jun 3. The game ends after the June 3 shift: the ending cutscene plays, then the player returns to the main menu. See 2.2.
5. **Tribal ID and out-of-state markers. PENDING: owner-designated source not yet read (site blocked from build environment).** The owner named South Dakota Searchlight, https://southdakotasearchlight.com/2024/01/31/sd-legislature-native-american-voter-registration-tribal-identification/ . The article has not been read and nothing in this document summarizes it. Current defaults stand: any fictional tribe key `tribe:*` is valid; an out-of-state ID qualifies when `citizenship_verified_marker == true`.
6. **PO box and address agreement. RESOLVED (owner decision).** The PO box mechanic is dropped. R2 passes iff the residency declaration lists an address whose state is South Dakota. Generated data may contain PO box style addresses as ordinary SD addresses with no special handling. Address agreement across documents is no longer checked.
7. **30-day clause in the briefing letter. RESOLVED (owner decision).** The letter does not quote the 30-day clause.
8. **Expired documents. RESOLVED (owner decision).** Expired documents do not satisfy any documentation requirement, tier 1 or tier 2. Documents without an expiry date (e.g., birth certificates) have `expiry_date: null` and pass.
9. **Federal "other documentation" item. RESOLVED (owner decision).** The federal provision is not modeled. `other_federal_documentation` and `federal_listed` are removed; tier 2 is exactly four document types.
10. **Restart behavior. RESOLVED (owner decision).** A restarted shift replays the same applicants in a shuffled order, except applicants with a `pinned_position`, which are never shuffled. Spec in 2.4.
11. **Age edge cases. RESOLVED (owner decision).** Turning 18 on election day is eligible. There is no Feb 29 in the game: the generator never produces Feb 29 birth dates and no calendar entry falls on Feb 29.
12. **Calendar boundaries. RESOLVED.** No shift is dated June 23 (see Q4).
13. **Label for June 2, 2026. RESOLVED (owner-stated, still unverified against a source).** The owner says June 2, 2026 was also the statewide primary. The calendar label is "statewide primary and municipal election", with `verified: false`.
14. **Consistency checks. OPEN.** Your A5 list says documents can disagree with each other (a different name or birth date on two documents). Should a name or birth-date mismatch between documents still be grounds to deny? Default: yes for name and birth date, handled inside R1 (birth date) and R3 (name). Address mismatches no longer count, per your Q6 answer. This applies to the full game, not just the MVP.

### Calendar and registration scope

15. **November 3, 2026 general election. RESOLVED (owner decision).** No November 3 election. The game ends after the June 3 shift.
16. **Prior registration vs residency. RESOLVED (owner decision).** No prior registration in the MVP; it is B1.

### Assets and licensing

17. **Desk flag license. RESOLVED (owner-verified, 2026-10-26).** The owner supplied the Commons permission notice, a public-domain release by the file author. Recorded in the manifest and checklist; approved for use; the placeholder pennant is removed. The follow-up about the underlying design is in section 13.

### Source text

18. **Section 15 reference. RESOLVED (Owner confirmed: B5).** The brief's "sidebar in the newspaper (Section 15)" means the B5 newspaper sidebar.

### Design risks

19. **Real names, legal review. RESOLVED.** The owner will decide on legal review personally. Flags are collected in section 13.
20. **Causation reading. RESOLVED.** The ending must avoid real names. Binding names policy in 1.3.
21. **Core-edit boundary. RESOLVED (manager default; owner may override).** Most rules are pure data. Occasionally a future rule needs a new kind of comparison the engine doesn't support yet (e.g. "within 30 days of the election"). Default: that rule may include a small self-contained function, and a comparison is only added to the engine itself once two or more rules need it.
22. **Conflict extensions. RESOLVED (manager default; owner may override).** Later rules will sometimes contradict earlier ones (e.g. a document accepted last month is no longer accepted). The doc proposes optional fields (3.8) so a new rule can say which rule it overrides, instead of rewriting old rules. Default: keep these as a plan and build them only when the first contradicting rule is added in Part B.
23. **Tone check on the 30-day gap. RESOLVED.** Removing the PO box mechanic does not change the 30-day point. It is still shown through absence (no form field, no tool), and PO box addresses still pass.
24. **Parody framing and employer separation. RESOLVED.** The owner states the project has nothing to do with their employer. The credit-line suggestion is removed.
25. **Seal and flag as government symbols. RESOLVED.** No "fictional" marker. The real seal is never used.
26. **Applicant fairness in generation. RESOLVED.** Confirmed: fictional applicants are not built from stereotypes of real groups, and tribal ID entries use fictional tribe keys.

### New questions (v2)

27. **N1. June 1 shift vs the registration deadline. OPEN.** If registration closes 15 days before an election (the owner's statement), then on June 1 the June 2 election is already closed, and the first election a June 1 registrant could vote in is the June 23 runoff. Should the calendar's "next election" mean "next election still open for registration"? If so, from May 18 (the June 2 deadline) the next election is June 23, the June 1 shift's age cutoff becomes 2008-06-23, and the display reads "June 23, 2026". Default: unchanged until the owner answers.
28. **N2. Newspaper date vs shift date. OPEN.** B3/B5 put the newspaper on the Feb to Mar shift, which is now dated February 1, 2026, but the paper is dated March 26, 2026. Should it move to the March 1 shift (still dated in the future), to the April 1 shift, or should the paper's date change?
29. **N3. SB 175 effective date. OPEN (manager inference, unsourced).** South Dakota laws commonly take effect July 1 unless they carry an emergency clause. If SB 175 was signed March 26, 2026 without one, enforcing it in April 2026 would be a dramatized timeline. Should the game keep April, and should the effective date go on the checklist? (Checklist row added: UNSOURCED.)
30. **N4. Runoff registration. OPEN.** Can new voters register for the June 23 runoff at all, or only those registered for June 2? The answer decides whether the June 3 shift processes runoff registrations. (Checklist row added: UNSOURCED.)

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
| 2026-10-26 | v2 | Opus reviewer | Owner answered Q1-Q26; revision v2 requested (owner decisions, names policy, legal-review section, new questions N1-N4) | — |
| 2026-10-26 | v2 | Sonnet drafter | Revision v2 | build-time fetch; design-rights phrasing |
| 2026-10-26 | v2 | Opus reviewer | APPROVED v2 after 2 fixes; Step 1 deliverable complete | Owner items: Q5 (source unread), Q14, Q27-Q30; checklist awaiting owner verification; section 13 for final release |

---

## 13. Legal review flags (for final-release review by the owner)

| Item | Why flagged | Status |
|---|---|---|
| Real county name (Minnehaha) and office setting | A real government office is used as the setting of a parody | open |
| Real governor's name in the B5 newspaper | Real official named in satire; subject to the names policy (1.3) if the owner chooses | open |
| Dakota Snout masthead parodying a real outlet | Trademark and parody boundary | open |
| B12 title card citing real runoff margins | Accuracy; must cite the official canvass | open |
| Flag design vs file PD release | The PD notice is from the file's author; whether it covers the underlying flag design (design rights possibly held by the City of Sioux Falls; unverified) is a final-release check | open |
| Statutory text accuracy for every rule shown to players | Rule text shown to players must match the enacted text; all rules are `verified: false` | open |
| Public release by an author employed in politics read as an organizational statement | Reputational, not legal, despite being a personal project | open |
| Searchlight source not yet read | Q5 defaults rest on an owner-designated source that has not been read | open |
