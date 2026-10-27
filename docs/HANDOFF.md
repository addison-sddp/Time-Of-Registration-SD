# Build handoff

Read this first when continuing the build in a new session. `docs/DESIGN.md` is the spec.
Every design decision is recorded there (sections 11 and 12).

## Working agreement (from the owner)

- Opus manages and reviews; Sonnet agents write all code, tests, and docs.
- Each agent gets a complete brief and returns only the deliverable plus a short summary.
- Opus reviews against `docs/DESIGN.md`, sends specific fixes back, and stops after 3 review
  rounds on one deliverable, escalating anything left to the owner.
- Opus records each approval and open issue in the DESIGN.md change log (section 12).
- No one but the owner sets `verified: true`. Legal and factual claims stay unverified until the
  owner confirms them.
- Do not begin a phase the owner hasn't requested. The owner has approved the MVP build only;
  Part B (progression, newspaper, family economy, endings) is not started.
- Names policy: characters, outlets, or officials based on real ones get names from the owner.
  Never invent them.

## MVP build status

| Stage | Scope | Status |
|---|---|---|
| 1 | Scaffold, pure rule engine, R1–R3, calendar, shifts and economy data, tests | Done, approved 2026-10-27 |
| 2 | Seeded applicant generator (`src/gen`), save layer (`src/save`), tests | Done, approved 2026-10-27 |
| 3 | Playable DOM/CSS screen (`src/ui`), sandbox mode, audio, assets | Done, approved 2026-10-27 |

Commands: `npm install`, `npm test`, `npm run typecheck`, `npm run build`, `npm run dev`.

## Stage 2 brief outline

- Seedable PRNG; never `Math.random`. Applicant content is seeded by `hash(save_salt, shift_id)`.
  Order is seeded by `hash(save_salt, shift_id, attempt_number)`. A `pinned_position` is never
  shuffled (DESIGN 2.4).
- 5–10 applicants per shift. Generate from intent profiles: pass, or fail specific rules with
  specific conditions. The engine computes the verdict; generator intent is only checked in tests.
- Fictional names and street addresses only. No PO boxes. No Feb 29 dates. Tribal IDs use the
  R3 `participating_tribes` keys.
- Property test: for many seeds per profile, the engine verdict and `violated_rule_ids` equal the
  intent; same seed gives byte-identical output (DESIGN 3.9).
- Save layer: versioned v1 schema, migration list, try/catch storage, refuse newer versions
  without overwriting (DESIGN 6.4–6.5).
- Engine, rules, and generator code must stay free of DOM, storage, and randomness
  (`tests/boundary.test.ts`; avoid the bare word for the browser global even in comments there).

## Stage 3 brief outline

- DOM/CSS single screen per DESIGN section 7: civic palette tokens, grain, stamp-and-ink,
  typewriter type, cramped booth.
- Briefing letter headed "Office of the South Dakota Secretary of State"; plain rule text, no
  editorial text, does not quote the 30-day clause.
- Desk election display reads the calendar: next election, label, registration deadline.
- Original fictional Minnehaha County seal (SVG drawn from scratch, never from the real seal).
  Sioux Falls flag from `assets/flag_sioux_falls.svg`, movable like other desk items.
- Procedural portraits only. Web Audio hum, stamp thud, typewriter clicks.
- Three errors restart the shift. Shift summary text is neutral.
- Sandbox mode for testing: pick active rules and an `as_of` date.
- Full keyboard play; stamps differ by shape and label, not only color; text scaling; reduced
  motion.
- The 30-day applicant's dialogue is a placeholder key the owner will fill in later.

## Pending owner items (not blocking)

- 30-day applicant line (later).
- Stage 3 placeholders: Rev. dates and
  SD Class text in `narrative.json`; s05 scripted applicant's name and address; seal resemblance check;
  fine-print legibility.
- Verification checklist (DESIGN section 10) and legal-review flags (section 13) before any
  public release. The SB 175 statutory text is still unchecked against the enacted law.
