import { describe, expect, it } from "vitest";
import { normalizePhone, parseTags } from "./format";

describe("parseTags", () => {
  it("trims, lowercases and dedupes", () => {
    expect(parseTags(" VIP, lead quente ,vip,, ")).toEqual(["vip", "lead quente"]);
  });
});

describe("normalizePhone", () => {
  it("keeps digits only", () => {
    expect(normalizePhone("+55 (11) 99999-0000")).toBe("5511999990000");
    expect(normalizePhone("  ")).toBeNull();
  });
});
