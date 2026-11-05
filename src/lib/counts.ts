import { COUNTED_ACTIONS, type CountedAction, type CounterRow, type Counts } from "./types";

export function emptyCounts(): Counts {
  return { ...(Object.fromEntries(COUNTED_ACTIONS.map((a) => [a, 0])) as Record<CountedAction, number>), total: 0 };
}

export function countsFromRows(rows: CounterRow[]): Counts {
  const c = emptyCounts();
  for (const r of rows) {
    if (COUNTED_ACTIONS.includes(r.action)) {
      c[r.action] = Number(r.total);
      c.total += Number(r.total);
    }
  }
  return c;
}
