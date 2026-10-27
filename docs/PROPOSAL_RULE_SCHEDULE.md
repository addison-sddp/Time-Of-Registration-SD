# Proposal: monthly rule schedule (PENDING_REQUESTS item 26)

Status: PROPOSAL ONLY. Nothing here is built, and nothing here is approved. Drafted for the owner to approve, edit or reject.

## 1. What this is

Today R1 and R2 are active from s01 (October 2025) and only R3 arrives later (s07, April 2026), so s02-s06 and s08-s10 introduce nothing new. This proposal spreads the Part B1 items (DESIGN 3.11; checklist rows 57-59) across the shifts as new rules, so most briefings add one component (B3).

Limits on this draft:

- It uses only the B1 content already in DESIGN: prior registration, the six certification attestations, and the overseas-citizen provisions. No statute numbers, enactment dates or real names appear. Every rule's `source` is the owner brief with citation "UNSOURCED", `verified: false`.
- The real-world timing of these provisions is unknown to this draft. The month a rule appears is a GAME-PACING choice. It does not claim the law changed that month.
- Fixed points kept: R1/R2 from 2025-10 (s01); R3 from 2026-04 (s07); newspaper on s06; game ends after s10 (2026-06-03). In-game wording stays neutral (1.2).

The owner needs to decide: which of the rules below to build, in which months, and the questions in section 6.

## 2. Proposed schedule

All rows: `verified: false`; source "Owner brief (DESIGN 3.11 B1; checklist row NN)", citation "UNSOURCED". `introduced_month` is a pacing choice.

| Shift | Date | New rule | `introduced_month` | Game behaviour (one line) | Row |
|---|---|---|---|---|---|
| s01 | 2025-10-01 | none new (R1, R2) | 2025-10 | Existing | n/a |
| s02 | 2025-11-01 | `R4_PRIOR_REG` | 2025-11 | Form lists any prior registration; a listed prior registration must include state and address (listing the address is what cancels it) | 59 |
| s03 | 2025-12-01 | `R5_CERT_BASIC` | 2025-12 | Certification block must be signed, with "SD resident" and "18 by next election" attested | 57 |
| s04 | 2026-01-01 | `R6_CERT_STATUS` | 2026-01 | "Not judged mentally incompetent" and "not currently serving a felony sentence" attested | 57 |
| s05 | 2026-02-01 | `R7_CANCEL_AUTH` | 2026-02 | If a prior registration is listed, the "authorizes cancellation" attestation must be ticked | 57, 59 |
| s06 | 2026-03-01 | none | n/a | Newspaper day (B5); rule-free (see below) | n/a |
| s07 | 2026-04-01 | `R8_CERT_CITIZEN` (with existing R3) | 2026-04 | "Citizen" attestation required, arriving with the citizenship documents (B2) | 57 |
| s08 | 2026-05-01 | `R9_OVERSEAS` | 2026-05 | Overseas-citizen applications appear, checked against their own provisions | 58 |
| s09 | 2026-06-01 | none | n/a | Rule-free; runoff date change only | n/a |
| s10 | 2026-06-03 | none | n/a | Rule-free; last shift, feeds the B12 ledger | n/a |

Why this shape:

- s02-s05 each add one component, in an order that builds on what the player already knows: prior registration, then the form's attestations, then the pieces that relate to R1/R2 content (resident, age) before the ones that cannot be checked from documents.
- Splitting the six attestations into three rules (`R5`, `R6`, `R7`) plus one in April (`R8`) gives four small briefings instead of one long one, and keeps each error message pointing at a single condition. Alternative: one rule `R5_CERT` with per-item conditions. Simpler engine, but one big briefing item. Owner choice (Q2).
- The citizen attestation (`R8`) is held for s07 so it arrives with R3, per B2 ("citizenship rules arrive together"). The briefing for s07 then carries two rules on one theme. That stretches "one component per briefing" slightly; the component is "citizenship".
- s06 stays rule-free because the newspaper is the new component that day. s09 and s10 stay rule-free so the June citizenship-rule ledger for B12 is not muddied by a new rule in the final days. Either could instead take `R9_OVERSEAS` if the owner prefers it later or earlier (Q3).
- `R9_OVERSEAS` is placed in s08 because it is the largest design cost (section 4) and benefits from the most mature set of rules to select a subset from.

## 3. Rule drafts (DESIGN 3.2 format)

New optional `Application` sections (DESIGN 3.4 and 3.11 anticipate them; absent in the MVP). Each rule returns `not_applicable` when its section is absent, except where noted.

```ts
interface PriorRegistration {            // optional
  listed: boolean;                       // applicant listed a prior registration
  state: string | null;                  // 2-letter code as written
  address_line: string | null;
  address_city: string | null;
}
interface Certification {                // optional
  signed: boolean;                       // signature present
  attests_citizen: boolean;
  attests_age_by_election: boolean;
  attests_sd_resident: boolean;
  attests_not_incompetent: boolean;
  attests_no_felony_sentence: boolean;
  attests_cancel_prior: boolean;         // sole owner of the cancellation tick (R7); see Q7
}
interface Overseas {                     // optional
  citizen_or_spouse: "citizen" | "spouse_of_citizen";
  last_sd_domicile_address: string | null;
  domicile_registration_voting_elsewhere: boolean;
  last_county_precinct: string | null;
  absentee_requested_for: string | null; // county/precinct the ballot would go to
}
```

### 3.1 `R4_PRIOR_REG` (s02)

```yaml
id: R4_PRIOR_REG
introduced_month: "2025-11"            # game pacing; real-world timing unknown
applies_to: [application.prior_registration.listed, .state, .address_line]
check: "not_applicable if prior_registration absent or listed == false.
        fail if listed AND (state is empty OR address_line is empty).
        pass otherwise (listing the prior address is what cancels it)"
error_message: "Prior registration: {condition}."
source: { citation: "UNSOURCED", note: "Owner brief (DESIGN 3.11 B1; checklist row 59)" }
verified: false
```

Condition: "prior registration listed without address".

- Shows: a "Previous registration" box on the form (state, street address, city).
- Failing applicant: prior registration marked as listed but state or street address left blank. Generator perturber: `prior_registration_incomplete`. The cancellation tick is owned by R7 alone.
- Design decision (Q6): the brief also says prior info "can update an SD registration" (name change, in-state move). That is an outcome other than approve/deny and needs the 3.11 side-effect verdict. This draft does not include it; `R4` only checks the cancellation condition. Updating is shown as an optional later extension (section 5).

### 3.2 `R5_CERT_BASIC` (s03)

```yaml
id: R5_CERT_BASIC
introduced_month: "2025-12"
applies_to: [application.certification.signed, .attests_sd_resident,
             .attests_age_by_election]
check: "fail if certification.signed == false
        OR attests_sd_resident == false OR attests_age_by_election == false"
error_message: "Certification: {condition}."
source: { citation: "UNSOURCED", note: "Owner brief (DESIGN 3.11 B1; checklist row 57)" }
verified: false
```

Conditions: "certification not signed", "resident attestation not marked", "age attestation not marked".

- Shows: a "Certification, signed under penalty of perjury" block with checkboxes and a signature line.
- Failing applicant: a box left unticked or signature blank. Perturber: `cert_unticked(field)`, `cert_unsigned`.
- What the auditor can check: see Q4. These attestations overlap R1 and R2 content; R5 checks only the form is marked and signed. R1 and R2 still decide the underlying facts, so an applicant who ticks "18" with a failing birth date fails R1, not R5.

### 3.3 `R6_CERT_STATUS` (s04)

```yaml
id: R6_CERT_STATUS
introduced_month: "2026-01"
applies_to: [application.certification.attests_not_incompetent,
             application.certification.attests_no_felony_sentence]
check: "fail if either attestation is not marked"
error_message: "Certification: {condition}."
source: { citation: "UNSOURCED", note: "Owner brief (DESIGN 3.11 B1; checklist row 57)" }
verified: false
```

Conditions: "mental competence attestation not marked", "sentence status attestation not marked".

- Shows: two more checkboxes in the same block. Failing applicant: unmarked box. See Q4 and Q5; these are the items most exposed to tone risk.

### 3.4 `R7_CANCEL_AUTH` (s05)

```yaml
id: R7_CANCEL_AUTH
introduced_month: "2026-02"
applies_to: [application.prior_registration.listed,
             application.certification.attests_cancel_prior]
check: "not_applicable if prior_registration absent or listed == false.
        fail if listed AND attests_cancel_prior == false"
error_message: "Certification: {condition}."
source: { citation: "UNSOURCED", note: "Owner brief (DESIGN 3.11 B1; checklist rows 57, 59)" }
verified: false
```

Condition: "cancellation of previous registration not authorized".

- `R7` alone owns the cancellation tick (it lives only in `Certification`); `R4` checks only listing completeness. Alternative: fold `R7` into `R4`. Owner choice (Q7).

### 3.5 `R8_CERT_CITIZEN` (s07)

```yaml
id: R8_CERT_CITIZEN
introduced_month: "2026-04"            # same month as R3 (B2)
applies_to: [application.certification.attests_citizen]
check: "fail if attests_citizen == false"
error_message: "Certification: {condition}."
source: { citation: "UNSOURCED", note: "Owner brief (DESIGN 3.11 B1; checklist row 57)" }
verified: false
```

Condition: "citizenship attestation not marked".

- Unlike `R5`-`R7`, this attestation is on the same subject as R3. R3 checks documents; R8 checks the tick. An applicant can pass one and fail the other.
- Tone check (Q8): the player is already experiencing R3's effects. Keep the tick as a plain box on a form, with no extra emphasis.

### 3.6 `R9_OVERSEAS` (s08)

```yaml
id: R9_OVERSEAS
introduced_month: "2026-05"
applies_to: [application.overseas.citizen_or_spouse,
             application.overseas.last_sd_domicile_address,
             application.overseas.domicile_registration_voting_elsewhere,
             application.overseas.last_county_precinct,
             application.overseas.absentee_requested_for]
check: "not_applicable if overseas absent.
        fail if last_sd_domicile_address is empty
        OR domicile_registration_voting_elsewhere == true
        OR absentee_requested_for != last_county_precinct"
error_message: "Overseas application: {condition}."
source: { citation: "UNSOURCED", note: "Owner brief (DESIGN 3.11 B1; checklist row 58)" }
verified: false
```

Conditions: "no last South Dakota domicile listed", "domicile, registration or voting listed elsewhere", "absentee county or precinct differs from last residence".

- "Otherwise qualified" in the brief means the other rules still apply (R1 age; R3 from April). That is the subset question below.
- Shows: an overseas form variant: "Last South Dakota address", "Spouse of citizen" tick, "Other domicile, registration or voting" yes/no, "Absentee county/precinct".
- Failing applicant: perturbers `overseas_no_domicile`, `overseas_other_registration`, `overseas_wrong_precinct`. A new applicant variant flag in the generator selects the overseas profile.
- Design decisions flagged (3.8):
  1. Subset selection. R2 requires an SD address on the residency declaration, which an overseas applicant lacks. Option A: R2 returns `not_applicable` when `overseas` is present (core `not_applicable`, no extension needed, but R2 must be edited, which contradicts "data only"). Option B: `R9` carries `supersedes: ["R2_RESIDENCY"]` (needs the 3.8 optional field). Recommended B, if the owner approves 3.8; otherwise A.
  2. Outcome beyond approve/deny: "absentee in last-resided county/precinct" is a routing result. The MVP verdict has no field for it. Either treat it as a pure check (R9 fails when the form's precinct is wrong, as drafted) or add a verdict action field. The pure check needs no verdict change.
  3. Spouse path: the brief says "citizen or spouse last domiciled in SD". Whether a spouse applicant must also be a citizen is not stated in the B1 text, so this draft does not model the spouse's own citizenship beyond the `citizen_or_spouse` field. Owner to specify (Q9).

## 4. Engine, generator and save impacts

Engine (no code written; for scoping):

- `Application` gains three optional sections (above). DESIGN 3.2's generic guard (field absent from schema is a config error) must treat an absent optional section as `not_applicable`, not an error. Already implied by 3.11.
- `R9` optionally needs `supersedes` from 3.8 (Q10). The other five rules need no extension: they are plain conjunctions with `not_applicable`.
- No verdict changes unless the owner approves "update an SD registration" outcomes (section 5).

Generator:

- New perturbers per rule: `prior_registration_incomplete`, `cert_unticked(field)`, `cert_unsigned`, `overseas_*`. Per 3.7, a new field type needs a perturber; no core generator change.
- Determinism risk: adding new draws to the seeded generator changes the applicants of shifts that already exist. Use a separate seeded sub-stream for the new sections so existing seeds produce the same people (DESIGN 2.4, 3.9 "generator invariants"). The property test (3.9) then covers each rule without new code.

Save (DESIGN 6.5):

- The new Application sections are generated from the shift seed, not stored, so no schema change is needed for them. `decision_log` already stores `violated_rule_ids`; new ids are only strings.
- `seen_briefings` (planned v3) must know the new rule ids so that each briefing appears once. If item 26 is built before v3, `seen_briefings` or an equivalent must be added in v2/v3. A mid-game save is affected only for shifts not yet started; a shift already in progress keeps its applicant set. No destructive migration; `rule_set_version` is not in the v1 save, so a rule set change relies on the seed being stable (see the determinism note).

Narrative and UI:

- Narrative keys (B8, one per rule): `briefing.R4_PRIOR_REG`, `briefing.R5_CERT_BASIC`, `briefing.R6_CERT_STATUS`, `briefing.R7_CANCEL_AUTH`, `briefing.R8_CERT_CITIZEN`, `briefing.R9_OVERSEAS`. The owner writes the text; builders do not.
- Rulebook (PENDING_REQUESTS item 8): lists active rules only, so each new rule appears from its month. Item 10's principle also applies: text must fit only what that month requires, so earlier rule text must not mention later attestations.
- Reasons sheet: one checklist entry per condition string; label copy from the owner. New entries only; existing ones unchanged.
- Form UI: certification block, prior-registration box and overseas variant on the application form; the "form section" the player reads, plus checkbox icons (B10: shape and label, not colour alone).
- Tests: per-rule fixtures (pass, each failing condition, `not_applicable`), combination cases with R1/R2/R3, calendar activation per month, and `R9` against `R2` (subset).

## 5. Possible later extension (not in the schedule)

"Prior info can update an SD registration (name change, in-state move)." This needs a verdict that carries a side-effect action ("update record", "cancel prior"), which is a change to the 3.6 interface. It is the bigger design cost in B1 and is deliberately left out of the schedule. If wanted, it could ride on `R4` in s02 as a "name or address changed" prior-registration variant, but it would need a UI for the extra outcome.

## 6. Owner questions

1. Approve the idea at all (new rule most months), or keep the current R1/R2 then R3 schedule?
2. Granularity: the proposed `R5`/`R6`/`R7` split (one condition group per month), or one `R5_CERT` rule with several conditions? Which attestations, if any, to drop?
3. Months: accept s02 (prior reg), s03-s05 (certification), s07 (citizen attestation with R3), s08 (overseas), and rule-free s06, s09, s10? Move overseas earlier or later?
4. Are attestations checkboxes the player must verify on the form? Honest answer for an auditor at a window: the only things checkable are that a box is ticked and that the form is signed. "Resident" and "18 by the next election" can also be cross-checked against R2 and R1. This draft assumes the auditor checks only that boxes are ticked and signed.
5. "Not judged mentally incompetent" and "not currently serving a felony sentence": nothing at a window can verify these. The draft treats them as tick-only, as in Q4. Do you want them in the game at all? They carry the most risk of reading as commentary if the form or briefing says anything beyond the plain attestation text.
6. Do you want the "prior info updates an SD registration" outcomes (section 5), which need verdict side effects? Or keep B1 to approve/deny checks only?
7. Confirm the split (R4 checks listing completeness; R7 alone owns the cancellation tick), or fold R7 into R4?
8. Is two citizenship items in the s07 briefing (`R3`, `R8`) acceptable, given B3's "one new component per briefing" and B2's "arrive together"?
9. Overseas: what does the brief say about the spouse's own citizenship, and does the rule-subset need R3 (from April) and R1? Is the "domicile, registration or voting elsewhere" check one item or three?
10. Approve the 3.8 `supersedes` field (for `R9` over `R2`), or edit R2 to return `not_applicable` for overseas applicants?
11. Wording: supply briefing and form text for each new rule (B8 keys listed in section 4); builders will not write it.
12. Should real-world timing of each provision be supplied by the owner (to replace the pacing label), or stay labelled as pacing only?
