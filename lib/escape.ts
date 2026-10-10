/**
 * HTML escaping for the notification emails. Everything a visitor typed is
 * attacker-controlled text that arrives in the owner's inbox as HTML, so every
 * interpolation goes through escapeHtml() — element content and quoted
 * attribute values alike.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Text for a single-line context such as an email subject: control characters
 * (CR/LF included) become spaces, runs of whitespace collapse, and the result
 * is capped. A subject is a header; a newline in one is never wanted.
 */
export function oneLine(value: unknown, max = 120): string {
  const flat = String(value ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
