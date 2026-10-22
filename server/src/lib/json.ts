/**
 * JSON that is safe to put inside a <script> block.
 *
 * The pages carry their data to their own script in a JSON block, because the
 * strict CSP (script-src 'self') does not allow an inline script. The "<" of
 * a value is escaped, so no value can ever close the script tag and break out
 * of it.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
