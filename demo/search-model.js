export function findMatches(source, query, options = {}, limit = 2000) {
  if (!query) return { matches: [], limited: false };
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, options.matchCase ? 'gu' : 'giu');
  const word = (character) => !!character && /[\p{L}\p{N}_$]/u.test(character);
  const matches = [];
  for (const match of source.matchAll(pattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (
      options.wholeWord &&
      (word([...source.slice(Math.max(0, start - 2), start)].at(-1)) ||
        (word(String.fromCodePoint(source.codePointAt(end) ?? 0)) && end < source.length))
    )
      continue;
    if (matches.length === limit) return { matches, limited: true };
    matches.push({ start, end });
  }
  return { matches, limited: false };
}

export function matchFiles(paths, query, limit = 100) {
  const needle = query.trim().toLowerCase();
  const ranked = [];
  for (const path of paths) {
    const name = path.split('/').pop();
    const lower = path.toLowerCase();
    const base = name.toLowerCase();
    let score = 0;
    if (needle) {
      if (base.startsWith(needle)) score = 4;
      else if (base.includes(needle)) score = 3;
      else if (lower.includes(needle)) score = 2;
      else {
        let at = 0;
        for (const char of lower) if (char === needle[at]) at++;
        if (at !== needle.length) continue;
        score = 1;
      }
    }
    ranked.push({ path, name, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return { items: ranked.slice(0, limit), total: ranked.length };
}
