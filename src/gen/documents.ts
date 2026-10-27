import type { Document, DocumentType, ISODate, Sex } from "../engine/types";
import { BIRTH_STATE_CODES, CITIES, SD_PLACES, STREET_NAMES, STREET_SUFFIXES, type UsState } from "./content";
import { addDays, addYears, maxDate, minDate, randomDate } from "./dates";
import type { Rng } from "./rng";
import type { GenContext } from "./types";

// Document builders. Every date they emit satisfies birth < issue <= as_of < expiry,
// except where a builder is asked for an expired document (expiry < as_of).

export interface Env {
  rng: Rng;
  ctx: GenContext;
  birth: ISODate;
  portrait: number;
  sex: Sex;
}

export interface Address {
  line: string;
  city: string;
  state: string;
  postal: string;
}

export type Tier2Type =
  | "birth_certificate"
  | "us_passport"
  | "consular_report_of_birth_abroad"
  | "certificate_of_naturalization";

export function makeAddress(rng: Rng, state: UsState): Address {
  const line = `${rng.int(100, 9899)} ${rng.pick(STREET_NAMES)} ${rng.pick(STREET_SUFFIXES)}`;
  if (state.code === "SD") {
    // Real South Dakota places; the street and number stay invented.
    const place = rng.weighted(SD_PLACES.map((p) => [p, p.weight] as const));
    return { line, city: place.city, state: "SD", postal: rng.pick(place.zips) };
  }
  return { line, city: rng.pick(CITIES), state: state.code, postal: String(rng.int(state.zip_lo, state.zip_hi)) };
}

function blank(doc_id: string, type: DocumentType): Document {
  return {
    doc_id,
    type,
    is_photocopy: false,
    issue_date: null,
    expiry_date: null,
    issuing_jurisdiction: null,
    citizenship_verified_marker: null,
    name: null,
    birth_date: null,
    sex: null,
    address_line: null,
    address_city: null,
    address_state: null,
    address_postal: null,
    portrait_seed: null,
  };
}

function withAddress(d: Document, a: Address | null): Document {
  if (a === null) return d;
  return { ...d, address_line: a.line, address_city: a.city, address_state: a.state, address_postal: a.postal };
}

export const cloneDoc = (d: Document): Document => ({ ...d });

interface Span {
  issue: ISODate;
  expiry: ISODate;
}

// Issued no earlier than lo and still current on as_of. Now and then the expiry falls
// exactly on as_of, which still counts as unexpired.
function validSpan(env: Env, years: number, lo: ISODate): Span {
  const { rng, ctx } = env;
  const floor = maxDate(lo, addDays(addYears(ctx.as_of, -years), 1));
  if (rng.chance(0.06)) {
    const issue = maxDate(lo, addYears(ctx.as_of, -years));
    if (issue < ctx.as_of) return { issue, expiry: ctx.as_of };
  }
  const issue = randomDate(rng, floor, ctx.as_of);
  return { issue, expiry: addYears(issue, years) };
}

// Expired a day to a few years before as_of (a day is the edge case).
function expiryBeforeAsOf(env: Env): ISODate {
  const k = env.rng.chance(0.2) ? 1 : env.rng.int(2, 900);
  return addDays(env.ctx.as_of, -k);
}

function expiredSpan(env: Env, years: number, lo: ISODate): Span {
  const expiry = expiryBeforeAsOf(env);
  let issue = maxDate(lo, addYears(expiry, -years));
  if (issue >= expiry) issue = addDays(expiry, -1);
  return { issue, expiry };
}

const licenseAge = (env: Env): ISODate => minDate(addYears(env.birth, 16), env.ctx.as_of);

export function sdLicense(
  env: Env, doc_id: string, name: string, addr: Address, kind: "new" | "old" | "new_nomarker",
): Document {
  const { rng, ctx } = env;
  let span: Span;
  if (kind !== "old") {
    // Issued on or after the threshold (qualifying only when the marker is true): issued on or after the threshold (the threshold day itself is an edge case).
    const lo = maxDate(ctx.sd_license_min_issue_date, licenseAge(env));
    span =
      lo === ctx.sd_license_min_issue_date && rng.chance(0.05)
        ? { issue: lo, expiry: addYears(lo, 5) }
        : validSpan(env, 5, lo);
  } else {
    // Issued before the threshold and still current: a valid license that does not qualify.
    const hi = minDate(addDays(ctx.sd_license_min_issue_date, -1), ctx.as_of);
    const lo = minDate(hi, maxDate(licenseAge(env), addDays(addYears(ctx.as_of, -5), 1)));
    const issue = randomDate(rng, lo, hi);
    span = { issue, expiry: addYears(issue, 5) };
  }
  return withAddress(
    {
      ...blank(doc_id, "sd_drivers_license"),
      issue_date: span.issue,
      expiry_date: span.expiry,
      issuing_jurisdiction: "SD",
      // Owner decision 2026-10-27: new licenses carry the marker unless asked for "new_nomarker";
      // licenses from before the threshold never do.
      citizenship_verified_marker: kind === "new",
      name,
      birth_date: env.birth,
      sex: env.sex,
      portrait_seed: env.portrait,
    },
    addr,
  );
}

export function otherStateLicense(
  env: Env,
  doc_id: string,
  name: string,
  addr: Address,
  opts: { nondriver: boolean; marker: boolean | null; expired: boolean },
): Document {
  const lo = opts.nondriver ? addDays(env.birth, 1) : licenseAge(env);
  const span = opts.expired ? expiredSpan(env, 6, lo) : validSpan(env, 6, lo);
  return withAddress(
    {
      ...blank(doc_id, opts.nondriver ? "other_state_nondriver_id" : "other_state_drivers_license"),
      issue_date: span.issue,
      expiry_date: span.expiry,
      issuing_jurisdiction: addr.state,
      citizenship_verified_marker: opts.marker,
      name,
      birth_date: env.birth,
      sex: env.sex,
      portrait_seed: env.portrait,
    },
    addr,
  );
}

export function tribalId(
  env: Env,
  doc_id: string,
  name: string,
  addr: Address | null,
  opts: { tribe_key: string; photocopy: boolean; expired: boolean },
): Document {
  const { rng, ctx } = env;
  const lo = addDays(env.birth, 1);
  let span: { issue: ISODate; expiry: ISODate | null };
  if (opts.expired) {
    span = expiredSpan(env, 5, lo);
  } else if (rng.chance(0.1)) {
    span = { issue: randomDate(rng, maxDate(lo, addYears(ctx.as_of, -10)), ctx.as_of), expiry: null };
  } else {
    span = validSpan(env, 5, lo);
  }
  return withAddress(
    {
      ...blank(doc_id, "tribal_id"),
      is_photocopy: opts.photocopy,
      issue_date: span.issue,
      expiry_date: span.expiry,
      issuing_jurisdiction: opts.tribe_key,
      name,
      birth_date: env.birth,
      sex: env.sex,
      portrait_seed: env.portrait,
    },
    addr,
  );
}

function passportSpan(env: Env, expired: boolean): Span {
  const sixteen = addYears(env.birth, 16);
  if (expired) {
    const expiry = expiryBeforeAsOf(env);
    const tenYear = addYears(expiry, -10);
    if (tenYear >= sixteen) return { issue: tenYear, expiry };
    return { issue: maxDate(addYears(expiry, -5), addDays(env.birth, 1)), expiry };
  }
  // Ten-year adult passports; five-year passports for applicants not yet 16.
  return sixteen <= env.ctx.as_of
    ? validSpan(env, 10, sixteen)
    : validSpan(env, 5, addDays(env.birth, 1));
}

export function tier2Document(
  env: Env,
  doc_id: string,
  type: Tier2Type,
  name: string,
  opts: { photocopy: boolean; expired: boolean },
): Document {
  const { rng, ctx } = env;
  const base = { ...blank(doc_id, type), is_photocopy: opts.photocopy, name, birth_date: env.birth, sex: env.sex };
  switch (type) {
    case "us_passport": {
      const span = passportSpan(env, opts.expired);
      return {
        ...base,
        issue_date: span.issue,
        expiry_date: span.expiry,
        issuing_jurisdiction: "US",
        portrait_seed: env.portrait,
      };
    }
    case "birth_certificate":
      return {
        ...base,
        issue_date: randomDate(rng, addDays(env.birth, 1), ctx.as_of),
        issuing_jurisdiction: rng.pick(BIRTH_STATE_CODES),
      };
    case "consular_report_of_birth_abroad":
      return {
        ...base,
        issue_date: randomDate(rng, addDays(env.birth, 1), minDate(ctx.as_of, addYears(env.birth, 3))),
        issuing_jurisdiction: "US",
      };
    case "certificate_of_naturalization":
      return {
        ...base,
        issue_date: randomDate(rng, addYears(env.birth, 18), ctx.as_of),
        issuing_jurisdiction: "US",
        portrait_seed: env.portrait,
      };
  }
}

// Library card, employee badge, gym card and the like. Never one of the recognized types,
// and carries no birth date, so it cannot affect any rule.
export function distractor(env: Env, doc_id: string, name: string): Document {
  const { rng, ctx } = env;
  const issue = randomDate(rng, maxDate(addDays(env.birth, 1), addYears(ctx.as_of, -3)), ctx.as_of);
  return {
    ...blank(doc_id, "other_unrecognized"),
    issue_date: issue,
    expiry_date: rng.chance(0.5) ? addYears(issue, 3) : null,
    name,
    portrait_seed: rng.chance(0.5) ? env.portrait : null,
  };
}

export function residencyDeclaration(doc_id: string, name: string, addr: Address | null): Document {
  return withAddress({ ...blank(doc_id, "residency_declaration"), name }, addr);
}
