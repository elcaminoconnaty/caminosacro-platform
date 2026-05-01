/**
 * Render simple {{var}} → value template substitution.
 * No HTML parsing; templates are markdown-flavored plain text suitable for Gmail.
 */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    if (v == null) return "";
    return String(v);
  });
}
