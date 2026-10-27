import type { Application, Document, ISODate } from "../engine/types";
import { minusYears } from "../engine/dates";
import { R3_EXPIRED, R3_NAME_DIFFERS, R3_PHOTOCOPY } from "./conditions";
import { LAST_NAMES, OTHER_STATES, SD } from "./content";
import { addDays, addYears, minDate } from "./dates";
import {
  cloneDoc, distractor, makeAddress, otherStateLicense, residencyDeclaration, sdLicense,
  tier2Document, tribalId, type Address, type Env, type Tier2Type,
} from "./documents";
import type { Rng } from "./rng";
import { printName, type Person, type Spec } from "./spec";
import type { GenContext } from "./types";

// Turns a finished Spec into an Application. How the citizenship documents are laid out is
// decided here, once the final birth date is known, because it depends on age.

type ProofKind =
  | "sd_new" | "other_state_marker" | "tribal" | "tier2"
  | "none_empty" | "none_distractor" | "none_old_license" | "none_no_marker";

interface Proof {
  kind: ProofKind;
  tier2_type: Tier2Type;
  photocopy: boolean;
  expired: boolean;
  name_wrong: boolean;
  shared_id: boolean; // tribal only: the tribal ID is also the identity document
}

interface Facts {
  sdNewOk: boolean; // old enough for a license, and a post-threshold issue date can exist
  oldSdOk: boolean; // old enough to hold a license issued before the threshold
  stateLicOk: boolean; // old enough for a driver's license
  adult: boolean;
}

function factsFor(spec: Spec, ctx: GenContext): Facts {
  const sixteen = addYears(spec.birth_date, 16);
  const oldHi = minDate(addDays(ctx.sd_license_min_issue_date, -1), ctx.as_of);
  return {
    sdNewOk: ctx.sd_new_ok && sixteen <= ctx.as_of,
    oldSdOk: sixteen <= oldHi,
    stateLicOk: sixteen <= ctx.as_of,
    adult: spec.birth_date <= minusYears(ctx.as_of, 18),
  };
}

function resolveProof(rng: Rng, spec: Spec, ctx: GenContext, f: Facts): Proof {
  const cond = spec.r3_condition;
  const tier2Types: Tier2Type[] = [
    "birth_certificate", "us_passport", "consular_report_of_birth_abroad",
    ...(f.adult ? (["certificate_of_naturalization"] as const) : []),
  ];
  const make = (kind: ProofKind, extra: Partial<Proof> = {}): Proof => ({
    kind,
    tier2_type: kind === "tier2" ? rng.pick(tier2Types) : "us_passport",
    photocopy: false,
    expired: false,
    name_wrong: false,
    shared_id: rng.chance(0.7),
    ...extra,
  });
  const tier1: ProofKind[] = [...(f.sdNewOk ? (["sd_new"] as const) : []), "other_state_marker", "tribal"];

  if (cond === R3_PHOTOCOPY) return make(rng.pick(tier1), { photocopy: true });
  if (cond === R3_EXPIRED) {
    // Minors only have a (five-year) passport old enough to have lapsed.
    const kind = f.adult ? rng.pick<ProofKind>(["other_state_marker", "tribal", "tier2"]) : "tier2";
    return make(kind, { expired: true, tier2_type: "us_passport" });
  }
  if (cond === R3_NAME_DIFFERS) return make(rng.pick<ProofKind>([...tier1, "tier2"]), { name_wrong: true });
  if (cond !== null) {
    // R3_NO_QUALIFYING: nothing that classifies as tier 1 or tier 2.
    const none: ProofKind[] = ["none_empty", "none_distractor", "none_no_marker"];
    if (f.oldSdOk) none.push("none_old_license");
    return make(rng.pick(none));
  }

  // Must satisfy R3 (or R3 is inactive and anything goes).
  const entries: [ProofKind, number][] = [["other_state_marker", 2], ["tribal", 2], ["tier2", 3]];
  if (f.sdNewOk) entries.push(["sd_new", 3]);
  if (!ctx.active_rule_ids.includes("R3_CITIZENSHIP")) {
    entries.push(["none_empty", 1], ["none_distractor", 1], ["none_no_marker", 1]);
    if (f.oldSdOk) entries.push(["none_old_license", 1]);
  }
  const kind = rng.weighted(entries);
  // Tier 2 accepts photocopies (Q3); tier 1 never may.
  return make(kind, { photocopy: kind === "tier2" && rng.chance(0.4) });
}

// A different name for the same person: maiden-style surname, hyphenated surname, or no middle initial.
function altPerson(rng: Rng, p: Person): Person {
  const style = rng.pick(["surname", "hyphen", "middle"] as const);
  if (style === "middle" && p.middle !== null) return { ...p, middle: null };
  if (style === "hyphen") return { ...p, last: `${p.last}-${rng.pick(LAST_NAMES)}` };
  let last = rng.pick(LAST_NAMES);
  while (last === p.last) last = rng.pick(LAST_NAMES);
  return { ...p, last };
}

export function renderApplication(
  spec: Spec,
  rng: Rng,
  ctx: GenContext,
  application_id: string,
): Application {
  const env: Env = { rng, ctx, birth: spec.birth_date, portrait: spec.portrait_seed };
  const f = factsFor(spec, ctx);
  const proof = resolveProof(rng, spec, ctx, f);
  const idId = `${application_id}-id`;
  const citId = `${application_id}-c1`;

  const formName = printName(spec.person);
  // Names print in either case; the engine ignores case and punctuation.
  const printed = (p: Person): string => {
    const n = printName(p);
    return rng.chance(0.35) ? n.toUpperCase() : n;
  };
  const docName = (): string => printed(proof.name_wrong ? altPerson(rng, spec.person) : spec.person);
  const plainName = (): string => printed(spec.person);

  // Addresses. R2 reads only the residency declaration; the ID address is never compared.
  let resAddr: Address | null = null;
  if (spec.residency.kind === "sd") resAddr = makeAddress(rng, SD);
  if (spec.residency.kind === "other_state") {
    const code = spec.residency.state;
    resAddr = makeAddress(rng, OTHER_STATES.find((s) => s.code === code) ?? SD);
  }
  const sdIdAddr =
    spec.residency.kind === "sd" && resAddr !== null && rng.chance(0.75) ? resAddr : makeAddress(rng, SD);
  const otherAddr = (): Address => makeAddress(rng, rng.pick(OTHER_STATES));

  // An identity document that never classifies under R3: a license from before the
  // threshold, or an out-of-state ID without the citizenship marker.
  const plainId = (): Document => {
    const options: (readonly ["nondriver" | "sd_old" | "state", number])[] = [["nondriver", 2]];
    if (f.oldSdOk) options.push(["sd_old", 4]);
    if (f.stateLicOk) options.push(["state", 3]);
    const marker = rng.chance(0.5) ? false : null;
    switch (rng.weighted(options)) {
      case "sd_old":
        return sdLicense(env, idId, plainName(), sdIdAddr, "old");
      case "state":
        return otherStateLicense(env, idId, plainName(), otherAddr(), { nondriver: false, marker, expired: false });
      default:
        return otherStateLicense(env, idId, plainName(), otherAddr(), { nondriver: true, marker, expired: false });
    }
  };
  const photocopied = (d: Document): Document => (proof.photocopy ? { ...d, is_photocopy: true } : d);

  let id: Document;
  let cit: Document[];
  switch (proof.kind) {
    case "sd_new": {
      id = photocopied(sdLicense(env, idId, docName(), sdIdAddr, "new"));
      cit = [cloneDoc(id)];
      break;
    }
    case "other_state_marker": {
      id = photocopied(
        otherStateLicense(env, idId, docName(), otherAddr(), {
          nondriver: !f.stateLicOk || rng.chance(0.25),
          marker: true,
          expired: proof.expired,
        }),
      );
      cit = [cloneDoc(id)];
      break;
    }
    case "tribal": {
      const tribal = tribalId(env, proof.shared_id ? idId : citId, docName(), rng.chance(0.6) ? sdIdAddr : null, {
        tribe_key: rng.pick(ctx.tribe_keys),
        photocopy: proof.photocopy,
        expired: proof.expired,
      });
      id = proof.shared_id ? tribal : plainId();
      cit = [tribal];
      break;
    }
    case "tier2": {
      const proofDoc = tier2Document(env, citId, proof.tier2_type, docName(), {
        photocopy: proof.photocopy && !proof.expired,
        expired: proof.expired,
      });
      id = plainId();
      cit = [proofDoc];
      if (rng.chance(0.3)) cit.unshift(cloneDoc(id)); // e.g. an old SD license beside a passport
      break;
    }
    case "none_old_license":
      id = sdLicense(env, idId, plainName(), sdIdAddr, "old");
      cit = [cloneDoc(id)];
      break;
    case "none_no_marker":
      id = otherStateLicense(env, idId, plainName(), otherAddr(), {
        nondriver: !f.stateLicOk || rng.chance(0.3),
        marker: rng.chance(0.5) ? false : null,
        expired: false,
      });
      cit = [cloneDoc(id)];
      break;
    default: // none_empty, none_distractor
      id = plainId();
      cit = [];
  }

  // Distractors: recognized by no rule and never change a verdict.
  const extras = proof.kind === "none_distractor" ? rng.int(1, 2) : rng.chance(0.15) ? 1 : 0;
  for (let i = 1; i <= extras; i++) {
    cit.splice(rng.int(0, cit.length), 0, distractor(env, `${application_id}-x${i}`, plainName()));
  }

  // Birth date: written the same everywhere, unless R1 asked for one place to disagree.
  let declared: ISODate = spec.birth_date;
  const mismatch = spec.birth_mismatch;
  if (mismatch !== null) {
    // The wrong date must still look possible: before every issue date it sits beside.
    const firstIssue = [id, ...cit].reduce<ISODate>((m, d) => (d.issue_date !== null && d.issue_date < m ? d.issue_date : m), ctx.as_of);
    const wrong = mismatch.date < firstIssue ? mismatch.date : addDays(spec.birth_date, -rng.int(1, 400));
    const other = cit.find((d) => d.birth_date !== null && d.doc_id !== id.doc_id);
    if (mismatch.target === "id") id = { ...id, birth_date: wrong };
    else if (mismatch.target === "citizenship" && other !== undefined) {
      cit = cit.map((d) => (d === other ? { ...d, birth_date: wrong } : d));
    } else declared = wrong;
  }

  return {
    application_id,
    applicant_name: formName,
    declared_birth_date: declared,
    id_document: id,
    residency_declaration: residencyDeclaration(`${application_id}-res`, plainName(), resAddr),
    citizenship_documents: cit,
  };
}
