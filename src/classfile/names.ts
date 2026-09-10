import type { ClassFile } from './model.js';

export function isAnonymousClass(cls: ClassFile): boolean {
  return cls.innerClasses.some((entry) => entry.inner === cls.name && entry.innerName === null);
}

export function enclosingClass(cls: ClassFile): string | undefined {
  return (
    cls.enclosing?.class ??
    cls.innerClasses.find((entry) => entry.inner === cls.name)?.outer ??
    undefined
  );
}
