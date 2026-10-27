// Name, street and place lists. Names and streets are invented; cities are fictional for
// every state except South Dakota, whose cities are real (SD_PLACES). There are no PO boxes.

// Sex-matched given names (the printed sex marker picks the list). Common, invented-feeling
// choices only; none belongs to a public figure.
export const FIRST_NAMES_F: readonly string[] = [
  "Abigail", "Amara", "Beatrice", "Bianca", "Camille", "Clara", "Corinne", "Dana", "Edith",
  "Elena", "Esme", "Fiona", "Greta", "Hazel", "Imogen", "Ingrid", "Josephine", "Kendra",
  "Leona", "Lucia", "Mabel", "Maren", "Nadia", "Naomi", "Odette", "Priya", "Renata", "Ruth",
  "Tamsin", "Ursula", "Willa", "Zoe",
];

export const FIRST_NAMES_M: readonly string[] = [
  "Adrian", "Anders", "Arlo", "Beckett", "Caleb", "Dalton", "Desmond", "Elias", "Emmett",
  "Felix", "Gideon", "Gus", "Harlan", "Hector", "Henry", "Isaac", "Jonah", "Julian", "Lars",
  "Marcus", "Nolan", "Otis", "Owen", "Rafael", "Silas", "Theo", "Vance", "Walter", "Yusuf",
];

export const FIRST_NAMES: readonly string[] = [...FIRST_NAMES_F, ...FIRST_NAMES_M];

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

// Real South Dakota cities and towns (street names and house numbers stay invented). One
// representative real ZIP per place (Sioux Falls has several), weighted toward Minnehaha
// County and the Sioux Falls area where the booth sits. No PO boxes.
export interface SdPlace {
  city: string;
  zips: readonly string[];
  weight: number;
}

export const SD_PLACES: readonly SdPlace[] = [
  { city: "Sioux Falls", zips: ["57103", "57104", "57105", "57106", "57107", "57108", "57110"], weight: 40 },
  { city: "Brandon", zips: ["57005"], weight: 4 },
  { city: "Harrisburg", zips: ["57032"], weight: 4 },
  { city: "Tea", zips: ["57064"], weight: 3 },
  { city: "Dell Rapids", zips: ["57022"], weight: 2 },
  { city: "Hartford", zips: ["57033"], weight: 2 },
  { city: "Canton", zips: ["57013"], weight: 2 },
  { city: "Lennox", zips: ["57039"], weight: 1 },
  { city: "Baltic", zips: ["57003"], weight: 1 },
  { city: "Garretson", zips: ["57030"], weight: 1 },
  { city: "Rapid City", zips: ["57701"], weight: 8 },
  { city: "Aberdeen", zips: ["57401"], weight: 5 },
  { city: "Brookings", zips: ["57006"], weight: 4 },
  { city: "Watertown", zips: ["57201"], weight: 4 },
  { city: "Mitchell", zips: ["57301"], weight: 3 },
  { city: "Yankton", zips: ["57078"], weight: 3 },
  { city: "Pierre", zips: ["57501"], weight: 3 },
  { city: "Huron", zips: ["57350"], weight: 3 },
  { city: "Vermillion", zips: ["57069"], weight: 3 },
  { city: "Spearfish", zips: ["57783"], weight: 2 },
  { city: "Box Elder", zips: ["57719"], weight: 2 },
  { city: "Madison", zips: ["57042"], weight: 2 },
  { city: "Sturgis", zips: ["57785"], weight: 1 },
  { city: "Belle Fourche", zips: ["57717"], weight: 1 },
  { city: "Milbank", zips: ["57252"], weight: 1 },
  { city: "Chamberlain", zips: ["57325"], weight: 1 },
  { city: "Mobridge", zips: ["57601"], weight: 1 },
  { city: "Hot Springs", zips: ["57747"], weight: 1 },
  { city: "Lead", zips: ["57754"], weight: 1 },
  { city: "Custer", zips: ["57730"], weight: 1 },
  { city: "Winner", zips: ["57580"], weight: 1 },
  { city: "Redfield", zips: ["57469"], weight: 1 },
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
