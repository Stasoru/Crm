export type DealForMetrics = {
  status: "OPEN" | "WON" | "LOST";
  value: number;
  stageId: string;
  source: string | null;
  ownerName: string | null;
  createdAt: Date;
  closedAt: Date | null;
};

export type GroupStat = { key: string; total: number; won: number; lost: number; conversion: number; wonValue: number };

export function summarize(deals: DealForMetrics[]) {
  const won = deals.filter((d) => d.status === "WON");
  const lost = deals.filter((d) => d.status === "LOST");
  const open = deals.filter((d) => d.status === "OPEN");
  const wonValue = sum(won.map((d) => d.value));
  const closed = won.length + lost.length;
  const cycleDays = won
    .filter((d) => d.closedAt)
    .map((d) => (d.closedAt!.getTime() - d.createdAt.getTime()) / 86_400_000);
  return {
    total: deals.length,
    open: open.length,
    won: won.length,
    lost: lost.length,
    openValue: sum(open.map((d) => d.value)),
    wonValue,
    // Share of closed deals that were won; open deals don't count yet.
    winRate: closed ? won.length / closed : 0,
    averageTicket: won.length ? wonValue / won.length : 0,
    averageCycleDays: cycleDays.length ? sum(cycleDays) / cycleDays.length : 0,
  };
}

export function groupBy(deals: DealForMetrics[], keyOf: (d: DealForMetrics) => string | null): GroupStat[] {
  const groups = new Map<string, DealForMetrics[]>();
  for (const d of deals) {
    const key = keyOf(d) || "Sem informação";
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const s = summarize(list);
      return { key, total: s.total, won: s.won, lost: s.lost, conversion: s.winRate, wonValue: s.wonValue };
    })
    .sort((a, b) => b.total - a.total);
}

function sum(values: number[]) {
  return values.reduce((acc, v) => acc + v, 0);
}
