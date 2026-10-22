const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

export const formatMoney = (value: number | string | { toString(): string }) => currency.format(Number(value.toString()));
export const formatDateTime = (d: Date) => dateTime.format(d);
export const formatDate = (d: Date) => date.format(d);

// "a, b ,c" -> ["a","b","c"], deduplicated and lowercased.
export function parseTags(input: string | null | undefined): string[] {
  if (!input) return [];
  return [...new Set(input.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

// Keeps digits only, so "+55 (11) 99999-0000" and "5511999990000" match the same contact.
export function normalizePhone(input: string | null | undefined): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  return digits.length ? digits : null;
}

export function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
