import { ApiError } from "./errors";

export interface IssuedDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

/**
 * Splits `YYYY-MM-DD` by hand. Going through Date would read the string as UTC midnight and can
 * land on the previous day once the server's zone is applied, which would break the link.
 */
export function parseIssuedOn(input: unknown): IssuedDate {
  if (typeof input !== "string") throw new ApiError(400, "Issue date is required");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!m) throw new ApiError(400, "Issue date must look like 2026-03-16");
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2999) throw new ApiError(400, "Issue date year looks wrong");
  if (month < 1 || month > 12) throw new ApiError(400, "Issue date month must be between 01 and 12");
  if (day < 1 || day > daysInMonth(year, month)) throw new ApiError(400, "That day does not exist in that month");
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function issuedToIso(d: IssuedDate): string {
  return `${String(d.year).padStart(4, "0")}-${pad2(d.month)}-${pad2(d.day)}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today in the server's own zone, as `YYYY-MM-DD`. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
