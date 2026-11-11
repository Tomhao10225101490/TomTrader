/** Redact runtime secrets before errors enter SQLite, APIs or diagnostic logs. */
export function redact(value: unknown): string {
  let text = String(value);
  for (const secret of [process.env.FINNHUB_API_KEY, process.env.TOMTRADER_DESKTOP_TOKEN]) {
    if (secret) text = text.split(secret).join('[REDACTED]');
  }
  return text.replace(/((?:api[_-]?key|token|authorization|password)["'\s:=]+)[^\s,"'}]+/gi, '$1[REDACTED]');
}
