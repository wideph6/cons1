import { COUNTED_ACTIONS, type CounterRow, type Counts } from "./types";

export function emptyCounts(): Counts {
  return { upload: 0, replace: 0, rename: 0, delete: 0, total: 0 };
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
