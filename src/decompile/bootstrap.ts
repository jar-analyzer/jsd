import type { BootstrapMethod } from '../classfile/model.js';

const lookup = 'Ljava/lang/invoke/MethodHandles$Lookup;';
const string = 'Ljava/lang/String;';
const methodType = 'Ljava/lang/invoke/MethodType;';
const handle = 'Ljava/lang/invoke/MethodHandle;';
const callSite = 'Ljava/lang/invoke/CallSite;';
const object = 'Ljava/lang/Object;';
const cls = 'Ljava/lang/Class;';
const prefix = `(${lookup}${string}${methodType}`;

export const bootstrapDescriptors = {
  makeConcat: `${prefix})${callSite}`,
  makeConcatWithConstants: `${prefix}${string}[${object})${callSite}`,
  metafactory: `${prefix}${methodType}${handle}${methodType})${callSite}`,
  altMetafactory: `${prefix}[${object})${callSite}`,
  typeSwitch: `${prefix}[${object})${callSite}`,
  enumSwitch: `${prefix}[${object})${callSite}`,
  record: `(${lookup}${string}Ljava/lang/invoke/TypeDescriptor;${cls}${string}[${handle})${object}`,
  invoke: `(${lookup}${string}${cls}${handle}[${object})${object}`,
  getStaticFinal: `(${lookup}${string}${cls})${object}`,
  getStaticFinalExplicit: `(${lookup}${string}${cls}${cls})${object}`,
  nullConstant: `(${lookup}${string}${cls})${object}`,
  primitiveClass: `(${lookup}${string}${cls})${cls}`,
  enumConstant: `(${lookup}${string}${cls})Ljava/lang/Enum;`,
} as const;

export function matchesBootstrap(
  bootstrap: BootstrapMethod,
  owner: string,
  name: string,
  descriptor: string,
): boolean {
  const ref = bootstrap.ref;
  return (
    ref.kind === 6 &&
    (ref.referenceTag === undefined || ref.referenceTag === 10) &&
    ref.ref.owner === owner &&
    ref.ref.name === name &&
    ref.ref.descriptor === descriptor
  );
}
