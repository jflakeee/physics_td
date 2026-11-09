/**
 * i18n lookup (DETAILED_DESIGN_V2 §1, §19). All UI strings come from `i18n/ko.json`.
 * `{name}` placeholders are filled from `params`. Missing keys return the key itself.
 */
export type Dict = Readonly<Record<string, string>>;

export function createT(dict: Dict) {
  return (key: string, params?: Record<string, string | number>): string => {
    const s = dict[key];
    if (s === undefined) return key;
    return params ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : s;
  };
}
export type T = ReturnType<typeof createT>;
