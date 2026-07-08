/**
 * Escapes all five XML/HTML special characters.
 * Use for both HTML attribute values and XML text content.
 *
 * Covers: & < > " '
 */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
