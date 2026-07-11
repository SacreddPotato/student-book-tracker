const cairoDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Cairo",
});

export function formatCairoDateTime(utcIso: string): string {
  return cairoDateTimeFormatter.format(new Date(utcIso));
}
