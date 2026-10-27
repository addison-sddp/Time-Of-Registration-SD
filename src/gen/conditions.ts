// Failure condition strings, exactly as the rules report them (DESIGN 4.1 to 4.3).
// Tests compare these against the engine's details.condition.

export const R1_BELOW_ELIGIBILITY = (election_date: string): string =>
  `below eligibility date for the next election (${election_date})`;
export const R1_DIFFERS = "differs between documents";

export const R2_NOT_SD = "address state is not South Dakota";
export const R2_NO_ADDRESS = "no address listed";

export const R3_NO_QUALIFYING = "no qualifying document presented";
export const R3_PHOTOCOPY = "photocopy presented where original required";
export const R3_NAME_DIFFERS = "name differs between documents";
export const R3_EXPIRED = "document expired";
