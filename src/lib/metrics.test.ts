import { describe, expect, it } from "vitest";
import { groupBy, summarize, type DealForMetrics } from "./metrics";

const deal = (over: Partial<DealForMetrics>): DealForMetrics => ({
  status: "OPEN",
  value: 0,
  stageId: "s1",
  source: null,
  ownerName: null,
  createdAt: new Date("2026-01-01"),
  closedAt: null,
  ...over,
});

describe("summarize", () => {
  it("computes win rate over closed deals only", () => {
    const s = summarize([
      deal({ status: "WON", value: 100, closedAt: new Date("2026-01-11") }),
      deal({ status: "WON", value: 300, closedAt: new Date("2026-01-21") }),
      deal({ status: "LOST" }),
      deal({ status: "OPEN", value: 50 }),
    ]);
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(s.wonValue).toBe(400);
    expect(s.averageTicket).toBe(200);
    expect(s.openValue).toBe(50);
    expect(s.averageCycleDays).toBe(15);
  });

  it("handles no deals", () => {
    expect(summarize([])).toMatchObject({ total: 0, winRate: 0, averageTicket: 0 });
  });
});

describe("groupBy", () => {
  it("groups missing keys together and sorts by volume", () => {
    const rows = groupBy(
      [deal({ source: "Instagram", status: "WON", value: 10 }), deal({ source: "Instagram" }), deal({ source: null })],
      (d) => d.source,
    );
    expect(rows.map((r) => r.key)).toEqual(["Instagram", "Sem informação"]);
    expect(rows[0]).toMatchObject({ total: 2, won: 1, wonValue: 10 });
  });
});
