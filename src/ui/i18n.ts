/** Translate a key, substituting `{name}` placeholders. Missing keys return the key itself. */
export type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string;

/**
 * Build a translator over a flat key -> string dictionary (i18n/ko.json).
 * @example const t = createTranslate(dict); t('play.startWave', { n: 2 });
 */
export function createTranslate(dict: Readonly<Record<string, string>>): Translate {
  return (key, params) => {
    const s = dict[key] ?? key;
    if (!params) return s;
    return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
  };
}

/**
 * Fetch and validate a dictionary file.
 * @example const t = createTranslate(await loadDictionary('i18n/ko.json'));
 */
export async function loadDictionary(url: string): Promise<Record<string, string>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`i18n: ${url} ${res.status}`);
  const data: unknown = await res.json();
  if (typeof data !== 'object' || data === null) throw new Error(`i18n: ${url} is not an object`);
  return data as Record<string, string>;
}
