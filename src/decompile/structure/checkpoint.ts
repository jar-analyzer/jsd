export function checkpoint(
  roots: readonly object[],
  excluded = new Map<object, ReadonlySet<string>>(),
): () => void {
  const seen = new Set<object>();
  const restore: (() => void)[] = [];
  const capture = (value: unknown): void => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (value instanceof Map) {
      const entries = [...value.entries()];
      restore.push(() => {
        value.clear();
        for (const [key, item] of entries) value.set(key, item);
      });
      for (const [key, item] of entries) {
        capture(key);
        capture(item);
      }
      return;
    }
    if (value instanceof Set) {
      const entries = [...value];
      restore.push(() => {
        value.clear();
        for (const item of entries) value.add(item);
      });
      entries.forEach(capture);
      return;
    }
    const ignored = excluded.get(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of ignored ?? []) delete descriptors[key];
    restore.push(() => {
      for (const key of Object.getOwnPropertyNames(value)) {
        if (!ignored?.has(key) && !Object.hasOwn(descriptors, key))
          Reflect.deleteProperty(value, key);
      }
      Object.defineProperties(value, descriptors);
    });
    for (const descriptor of Object.values(descriptors)) capture(descriptor.value);
  };
  roots.forEach(capture);
  return () => {
    for (const reset of restore) reset();
  };
}
