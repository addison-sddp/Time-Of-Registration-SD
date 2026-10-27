export function normalizeName(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesMatch(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  const na = normalizeName(a);
  return na !== "" && na === normalizeName(b);
}
