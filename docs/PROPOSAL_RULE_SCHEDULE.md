# Proposal: monthly rule schedule (PENDING_REQUESTS item 26)

Status: PROPOSAL ONLY. Nothing here is built, and building is not approved. Revised 2026-10-27 with owner decisions.

## 1. What this is

R1 and R2 are active from s01 (October 2025) and only R3 arrives later (s07, April 2026), so most months add nothing. This proposal adds three small rules from Part B1 (DESIGN 3.11; checklist rows 57 and 59) so that s02, s04 and s07 each have something new.

Constraints:

- Content comes only from the B1 text already in DESIGN. No statute numbers, enactment dates or real names. Every rule: `source` = "Owner brief (DESIGN 3.11 B1; checklist row NN)", citation "UNSOURCED", `verified: false`.
- Fixed points kept: R1/R2 from 2025-10 (s01); R3 from 2026-04 (s07); newspaper on s06; game ends after s10 (2026-06-03). Wording stays neutral (DESIGN 1.2).

### Framing (owner decision)

The November and January additions are presented as office review items, not new law. The reviewer's working assumption is that prior registration and certification predate SB 175 (UNSOURCED, verified: false; owner to confirm), so the game must not imply the law changed in those months. Proposed bulletin line for those two months (DRAFT, owner to confirm): "Additional review items, effective [Month Year]." Only April (R3 plus the citizen box) reads as new law, consistent with B2.

## 2. Schedule

| Shift | Date | New rule | `introduced_month` | Framing | Game behaviour | Row |
|---|---|---|---|---|---|---|
| s01 | 2025-10-01 | none (R1, R2) | 2025-10 | n/a | Existing | n/a |
| s02 | 2025-11-01 | `R4_PRIOR_REG` | 2025-11 | Office review item | A listed prior registration must give state and street address | 59 |
| s03 | 2025-12-01 | none | n/a | n/a | n/a | n/a |
| s04 | 2026-01-01 | `R5_CERTIFICATION` | 2026-01 | Office review item | Certification must be signed; SD resident box and 18-by-next-election box ticked | 57 |
| s05 | 2026-02-01 | none | n/a | n/a | n/a | n/a |
| s06 | 2026-03-01 | none | n/a | n/a | Newspaper day (B5) | n/a |
| s07 | 2026-04-01 | `R6_CERT_CITIZEN` (with R3) | 2026-04 | New law (B2) | Citizen box must be ticked, arriving with citizenship documents | 57 |
| s08-s10 | 2026-05-01 to 2026-06-03 | none | n/a | n/a | n/a | n/a |

The month each rule appears is a GAME-PACING choice. The real-world timing of these provisions is not in DESIGN and is not claimed. Rule-free months leave room for the newspaper and keep the June denials ledger (B12) from being muddied by late rule changes.

R6 as its own rule (not a variant of R5), because:

- Its own `introduced_month` keeps this a data-only addition (DESIGN 3.7). A variant would need an `as_of` branch inside R5's check.
- R5's rulebook text and form never mention the citizen box before April (PENDING_REQUESTS item 10); a separate rule id gives that separation directly, and the briefing diff for s07 shows R3 and R6 as the one "citizenship" component.

Only the form design affects the box: from s07 the certification block shows a third box. The form may show the box earlier only if the owner decides so (it should not, per item 10).

## 3. Rule drafts (DESIGN 3.2 format)

New optional `Application` sections (anticipated by DESIGN 3.4 and 3.11; absent in the MVP). A rule returns `not_applicable` when its section is absent or, for R4, when nothing is listed.

```ts
interface PriorRegistration {            // optional
  listed: boolean;                       // applicant listed a prior registration
  state: string | null;                  // 2-letter code as written
  address_line: string | null;
  address_city: string | null;
}
interface Certification {                // optional
  signed: boolean;                       // signature present
  attests_sd_resident: boolean;
  attests_age_by_election: boolean;
  attests_citizen: boolean;              // shown on the form from 2026-04
}
```

### 3.1 `R4_PRIOR_REG` (s02)

```yaml
id: R4_PRIOR_REG
introduced_month: "2025-11"            # game pacing; real-world timing not stated
applies_to: [application.prior_registration.listed, .state, .address_line]
check: "not_applicable if prior_registration absent or listed == false.
        fail if listed AND (state is empty OR address_line is empty).
        pass otherwise"
error_message: "Prior registration: {condition}."
source: { citation: "UNSOURCED", note: "Owner brief (DESIGN 3.11 B1; checklist row 59)" }
verified: false
```

Condition: "prior registration listed without address".

- The form has a "Previous registration" box (state, street address, city). The B1 text says listing a prior address cancels it; the auditor does not cancel anything and there are no side-effect outcomes. The verdict stays approve/deny.
- Failing applicant: `listed` is true but state or street address is blank. Perturber: `prior_registration_incomplete`.
- Not modeled: "prior info can update an SD registration" (name change, in-state move), and "not registered in another state" as a separate check.

### 3.2 `R5_CERTIFICATION` (s04)

```yaml
id: R5_CERTIFICATION
introduced_month: "2026-01"
applies_to: [application.certification.signed, .attests_sd_resident,
             .attests_age_by_election]
check: "not_applicable if certification absent.
        fail if signed == false OR attests_sd_resident == false
        OR attests_age_by_election == false"
error_message: "Certification: {condition}."
source: { citation: "UNSOURCED", note: "Owner brief (DESIGN 3.11 B1; checklist row 57)" }
verified: false
```

Conditions: "certification not signed", "resident box not ticked", "age box not ticked".

- Form: a certification block under penalty of perjury with a signature line and two boxes.
- Failing applicant: signature blank or a box unticked. Perturbers: `cert_unsigned`, `cert_unticked(field)`.
- What the auditor can check: only that the form is signed and the boxes are ticked. The underlying facts stay with R1 (birth date) and R2 (address). An applicant who ticks "18" with a failing birth date fails R1, not R5.

### 3.3 `R6_CERT_CITIZEN` (s07)

```yaml
id: R6_CERT_CITIZEN
introduced_month: "2026-04"            # same month as R3 (B2)
applies_to: [application.certification.attests_citizen]
check: "not_applicable if certification absent. fail if attests_citizen == false"
error_message: "Certification: {condition}."
source: { citation: "UNSOURCED", note: "Owner brief (DESIGN 3.11 B1; checklist row 57)" }
verified: false
```

Condition: "citizen box not ticked".

- R3 checks documents; R6 checks the tick. An applicant can pass one and fail the other. Perturber: `cert_unticked(attests_citizen)`.
- Before 2026-04 the field is not shown on the form and the generator sets it true, so earlier shifts are unchanged.

## 4. Engine, generator and save impacts

Engine (no code written):

- `Application` gains two optional sections. The generic `applies_to` guard (3.2) must treat an absent optional section as `not_applicable`, not a configuration error.
- No 3.8 extension needed and no verdict change: all three are plain conjunctions.

Generator:

- New perturbers: `prior_registration_incomplete`, `cert_unsigned`, `cert_unticked(field)`. Per 3.7 a new field type needs a perturber; the 3.9 property test then covers each rule.
- Determinism: new draws would change existing shifts' applicants. Use a separate seeded sub-stream for the new sections so existing seeds yield the same people (DESIGN 2.4; 3.9 generator invariants).

Save (DESIGN 6.5):

- The new sections are generated from the shift seed, not stored. No schema change. `decision_log` already stores `violated_rule_ids`; new ids are only strings.
- `seen_briefings` (planned v3) must know the new rule ids so each briefing appears once.

Narrative and UI:

- Narrative keys (B8): `briefing.R4_PRIOR_REG`, `briefing.R5_CERTIFICATION`, `briefing.R6_CERT_CITIZEN`, plus the bulletin line key (e.g. `bulletin.review_items`).
- Rulebook (PENDING_REQUESTS item 8) lists active rules only, so each rule appears from its month. R5's text mentions only the signature and two boxes; R6's text appears only from April (item 10).
- Reasons sheet: one checklist entry per condition string; label copy from the owner. New entries only.
- Tests: per-rule fixtures (pass, each failing condition, `not_applicable`), combinations with R1/R2/R3, and activation per month in calendar and sandbox modes.

## 5. Dropped by owner

- Attestations: "not judged mentally incompetent", "not currently serving a felony sentence", "authorizes cancellation of previous registration".
- Overseas citizens (the whole provision), and with it the rule-subset and `supersedes` (3.8) question.
- Prior-info "update an SD registration" outcomes and any verdict side effects.

## 6. DRAFT label text for owner approval

All wording below is DRAFT, taken only from the B1 wording in DESIGN, for the owner to approve or replace. Builders do not write final copy.

| Item | DRAFT text |
|---|---|
| Bulletin line (Nov, Jan) | "Additional review items, effective [Month Year]." |
| R4 form label | "Previous registration (state, street address, city)" |
| R4 rulebook | "A listed previous registration must give a state and street address." |
| R5 form label | "I certify, under penalty of perjury, that I am a resident of South Dakota and will be 18 years of age by the next election." plus a signature line |
| R5 rulebook | "The certification must be signed and the resident and age boxes ticked." |
| R6 form label (from April) | "I am a citizen of the United States." |
| R6 rulebook (from April) | "The citizen box must be ticked." |
| Condition strings | As in section 3 |

## 7. Owner questions (still open)

1. Confirm the bulletin line wording for November and January: "Additional review items, effective [Month Year]."
2. Approve or replace the DRAFT form/attestation label text and rulebook text for R4-R6 (section 6).
3. Should R4 run in calendar mode only from s02 (sandbox ignores `introduced_month` as usual)?
4. Is R6 as its own rule acceptable (section 2), or do you prefer it as a variant of R5?
5. Part B go-ahead: build now, or keep this as a proposal until after the current build?
