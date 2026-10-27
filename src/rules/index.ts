import type { AnyRule } from "../engine/types";
import { r1Age } from "./r1_age";
import { r2Residency } from "./r2_residency";
import { r3Citizenship } from "./r3_citizenship";

export const rules: readonly AnyRule[] = [r1Age, r2Residency, r3Citizenship];
export { r1Age, r2Residency, r3Citizenship };
