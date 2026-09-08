import type { StackMapFrame } from './stackmap.js';
import type { ConstantPool } from './cpool.js';

export const enum Acc {
  Public = 0x0001,
  Private = 0x0002,
  Protected = 0x0004,
  Static = 0x0008,
  Final = 0x0010,
  Super = 0x0020,
  Synchronized = 0x0020,
  Open = 0x0020,
  Volatile = 0x0040,
  Bridge = 0x0040,
  Transient = 0x0080,
  Varargs = 0x0080,
  Native = 0x0100,
  Interface = 0x0200,
  Abstract = 0x0400,
  Strict = 0x0800,
  Synthetic = 0x1000,
  Annotation = 0x2000,
  Enum = 0x4000,
  Module = 0x8000,
}

export const MAJOR_TO_JAVA: Record<number, string> = {
  45: '1.1',
  46: '1.2',
  47: '1.3',
  48: '1.4',
  49: '5',
  50: '6',
  51: '7',
  52: '8',
  53: '9',
  54: '10',
  55: '11',
  56: '12',
  57: '13',
  58: '14',
  59: '15',
  60: '16',
  61: '17',
  62: '18',
  63: '19',
  64: '20',
  65: '21',
  66: '22',
  67: '23',
  68: '24',
  69: '25',
};

export type AnnVal =
  | { kind: 'const'; tag: string; value: number | bigint | string | boolean | undefined }
  | { kind: 'enum'; typeName: string; constName: string }
  | { kind: 'class'; className: string }
  | { kind: 'annotation'; ann: Ann }
  | { kind: 'array'; values: AnnVal[] };

export interface Ann {
  typeName: string;
  pairs: { name: string; value: AnnVal }[];
}

export interface MemberRef {
  owner: string;
  name: string;
  descriptor: string;
}

export interface MethodHandleRef {
  kind: number;
  referenceTag?: 9 | 10 | 11;
  ref: MemberRef;
}

export type BootstrapArg =
  | { kind: 'dynamic'; index: number; bsm: number; name: string; descriptor: string }
  | { kind: 'methodType'; descriptor: string }
  | { kind: 'methodHandle'; handle: MethodHandleRef }
  | { kind: 'type'; typeName: string }
  | { kind: 'string'; value: string }
  | { kind: 'int'; value: number }
  | { kind: 'long'; value: bigint }
  | { kind: 'float'; value: number }
  | { kind: 'double'; value: number };

export interface BootstrapMethod {
  ref: MethodHandleRef;
  args: BootstrapArg[];
}

export interface ExceptionEntry {
  startPc: number;
  endPc: number;
  handlerPc: number;
  catchType: string | null;
}

export interface LocalVarEntry {
  start: number;
  length: number;
  name: string;
  descriptor: string;
  signature?: string;
  index: number;
}

export interface CodeAttr {
  stackMapFrames?: StackMapFrame[];
  maxStack: number;
  maxLocals: number;
  code: Uint8Array;
  exceptions: ExceptionEntry[];
  lineNumbers: { startPc: number; line: number }[];
  localVars: LocalVarEntry[];
  localVarTypes: LocalVarEntry[];
}

export interface FieldInfo {
  access: number;
  name: string;
  descriptor: string;
  signature?: string;
  constantValue?: { tag: string; value: number | bigint | string | boolean | undefined };
  annotations: Ann[];
  synthetic: boolean;
  deprecated: boolean;
}

export interface MethodInfo {
  access: number;
  name: string;
  descriptor: string;
  signature?: string;
  code?: CodeAttr;
  thrown: string[];
  annotations: Ann[];
  paramAnnotations: Ann[][];
  annotationDefault?: AnnVal;
  methodParameters?: { name: string | null; access: number }[];
  synthetic: boolean;
  deprecated: boolean;
}

export interface InnerClassInfo {
  inner: string;
  outer: string | null;
  innerName: string | null;
  access: number;
}

export interface RecordComponent {
  name: string;
  descriptor: string;
  signature?: string;
  annotations: Ann[];
}

export interface ClassFile {
  minorVersion: number;
  majorVersion: number;
  access: number;
  name: string;
  superName: string | null;
  interfaces: string[];
  fields: FieldInfo[];
  methods: MethodInfo[];
  sourceFile?: string;
  signature?: string;
  enclosing?: { class: string; method: string | null; descriptor: string | null };
  innerClasses: InnerClassInfo[];
  nestHost?: string;
  nestMembers: string[];
  permitted: string[];
  recordComponents: RecordComponent[];
  bootstrapMethods: BootstrapMethod[];
  annotations: Ann[];
  unknownAttrs: string[];
  cp: ConstantPool;
}

export class ClassParseError extends Error {}
