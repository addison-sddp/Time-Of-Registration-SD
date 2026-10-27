// Original name, street and place lists. Everything here is invented; cities are fictional
// for every state, including South Dakota. There are no PO boxes.

export const FIRST_NAMES: readonly string[] = [
  "Abigail", "Adrian", "Amara", "Anders", "Beatrice", "Beckett", "Bianca", "Caleb", "Camille",
  "Corinne", "Dalton", "Dana", "Desmond", "Elena", "Elias", "Esme", "Felix", "Fiona", "Gideon",
  "Greta", "Harlan", "Hazel", "Hector", "Imogen", "Ingrid", "Isaac", "Jonah", "Josephine",
  "Julian", "Kendra", "Lars", "Leona", "Marcus", "Maren", "Nadia", "Nolan", "Odette", "Owen",
  "Priya", "Quinn", "Rafael", "Renata", "Silas", "Tamsin", "Theo", "Ursula", "Vance", "Willa",
  "Yusuf", "Zoe",
];

export const LAST_NAMES: readonly string[] = [
  "Abernathy", "Aldridge", "Arvidson", "Bergstrom", "Brandt", "Calloway", "Cortez", "Dahlgren",
  "Delacroix", "Ellison", "Fenwick", "Garza", "Gundersen", "Halvorsen", "Holloway", "Ingram",
  "Iverson", "Jessup", "Jorgensen", "Kessler", "Koenig", "Larkin", "Lindqvist", "Marchetti",
  "Mendoza", "Novak", "Nygaard", "Okafor", "Orlov", "Pemberton", "Prescott", "Quillen",
  "Rasmussen", "Redfern", "Salazar", "Sorensen", "Thorsen", "Tillman", "Underhill",
  "Vandermeer", "Voss", "Wexler", "Whitaker", "Yoder", "Zielinski",
];

export const MIDDLE_INITIALS = "ABCDEFGHJKLMNPRSTW".split("");

export const STREET_NAMES: readonly string[] = [
  "Larkspur", "Cottonwood", "Prairie Wind", "Cedar Hollow", "Sumac", "Willow Bend", "Granite",
  "Switchgrass", "Bluestem", "Harvest", "Orchard", "Meadowlark", "Birchwood", "Foxglove",
  "Windmill", "Copper Creek", "Aspen", "Heron", "Juniper", "Lantern", "Moss Hill", "Pinecrest",
  "Sandpiper", "Thistle", "Quarry", "Hawthorn", "Silo", "Clover", "Kestrel", "Marigold",
  "Tamarack", "Wheatfield",
];

export const STREET_SUFFIXES: readonly string[] = ["St", "Ave", "Rd", "Ln", "Dr", "Ct", "Blvd", "Way", "Pl"];

export const CITIES: readonly string[] = [
  "Larkmoor", "Quill Bend", "Tallgrass", "Ashby Flats", "Cobalt Ridge", "Verdant Lake",
  "Pennyroyal", "Harrow Creek", "Sable Prairie", "Wrenfield", "Marrow Butte", "Kestrel Falls",
  "Dunmore Flats", "Thistledown", "Orrin Springs", "Bellwether", "Cinder Gap", "Fallow Creek",
  "Gannet Rock", "Hollis Crossing", "Alderbrook", "Beacon Hollow", "Carrow", "Dovedale",
  "Embers Landing", "Fernwick", "Glenmoor", "Hartsmere", "Ivywood Bend", "Juniper Fork",
];

export interface UsState {
  code: string; // real 2-letter code
  zip_lo: number;
  zip_hi: number;
}

export const SD: UsState = { code: "SD", zip_lo: 57001, zip_hi: 57799 };

export const OTHER_STATES: readonly UsState[] = [
  { code: "MN", zip_lo: 55001, zip_hi: 56763 },
  { code: "IA", zip_lo: 50001, zip_hi: 52809 },
  { code: "NE", zip_lo: 68001, zip_hi: 69367 },
  { code: "ND", zip_lo: 58001, zip_hi: 58856 },
  { code: "MT", zip_lo: 59001, zip_hi: 59937 },
  { code: "WY", zip_lo: 82001, zip_hi: 83128 },
  { code: "CO", zip_lo: 80001, zip_hi: 81658 },
  { code: "WI", zip_lo: 53001, zip_hi: 54990 },
  { code: "KS", zip_lo: 66002, zip_hi: 67954 },
  { code: "IL", zip_lo: 60001, zip_hi: 62999 },
];

// Place of birth printed on a birth certificate: any of the above, SD most often.
export const BIRTH_STATE_CODES: readonly string[] = ["SD", "SD", "SD", ...OTHER_STATES.map((s) => s.code)];
