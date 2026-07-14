// UK-standard date/time formatters: dd/mm/yyyy and dd/mm/yyyy HHhMM (24-hour).
// Use these anywhere a date is shown to a user. Internal ISO timestamps
// (DB writes, API payloads) stay as toISOString.

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toDateOrNull(input: Date | string | number | null | undefined): Date | null {
  if (input === null || input === undefined || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** dd/mm/yyyy */
export function formatDateUK(input: Date | string | number | null | undefined): string {
  const d = toDateOrNull(input);
  if (!d) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** dd/mm/yyyy HHhMM (24-hour) */
export function formatDateTimeUK(input: Date | string | number | null | undefined): string {
  const d = toDateOrNull(input);
  if (!d) return "—";
  return `${formatDateUK(d)} ${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

/** HHhMM (24-hour) */
export function formatTimeUK(input: Date | string | number | null | undefined): string {
  const d = toDateOrNull(input);
  if (!d) return "—";
  return `${pad(d.getHours())}h${pad(d.getMinutes())}`;
}
