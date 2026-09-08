export function collectClasses(inputs, unzip) {
  const files = new Map();
  const add = (name, bytes) => {
    if (!/\.(class|jar|war|zip)$/i.test(name)) return;
    const path = name
      .replaceAll('\\', '/')
      .replace(/^\/+/, '')
      .replace(/\.class$/i, '.class');
    if (files.has(path)) throw new Error(`DUPLICATE: ${path}`);
    files.set(path, bytes);
  };
  for (const input of inputs) {
    if (/\.(jar|war|zip)$/i.test(input.name)) {
      const entries = unzip(input.bytes, {
        filter(entry) {
          return /\.(class|jar|war|zip)$/i.test(entry.name);
        },
      });
      for (const [name, bytes] of Object.entries(entries)) add(name, bytes);
    } else if (/\.class$/i.test(input.name)) add(input.name.split(/[\\/]/).pop(), input.bytes);
  }
  if (!files.size) throw new Error('NO_CLASSES');
  return [...files];
}
