import { parseStackMap } from './stackmap.js';
import { ByteReader } from '../util/bytes.js';
import { ConstantPool } from './cpool.js';
import { parseFieldDescriptor, parseMethodDescriptor } from './types.js';
import {
  Ann,
  AnnVal,
  BootstrapArg,
  BootstrapMethod,
  ClassFile,
  CodeAttr,
  ExceptionEntry,
  FieldInfo,
  InnerClassInfo,
  LocalVarEntry,
  MethodInfo,
  RecordComponent,
  TypeAnnotation,
} from './model.js';

interface RawAttr {
  name: string;
  data: Uint8Array;
}

function readAttrs(r: ByteReader, cp: ConstantPool): RawAttr[] {
  const n = r.u2();
  const out: RawAttr[] = [];
  for (let i = 0; i < n; i++) {
    const name = cp.utf8(r.u2());
    const len = r.u4();
    const data = r.bytes(len);
    out.push({ name, data });
  }
  return out;
}

function parseAnnotation(rd: ByteReader, cp: ConstantPool): Ann {
  const typeName = descriptorToInternal(cp.utf8(rd.u2()));
  const num = rd.u2();
  const pairs: { name: string; value: AnnVal }[] = [];
  for (let i = 0; i < num; i++) {
    const name = cp.utf8(rd.u2());
    pairs.push({ name, value: parseElementValue(rd, cp) });
  }
  return { typeName, pairs };
}

function descriptorToInternal(desc: string): string {
  if (desc.startsWith('L') && desc.endsWith(';')) return desc.slice(1, -1);
  return desc;
}

function parseElementValue(rd: ByteReader, cp: ConstantPool): AnnVal {
  const tag = String.fromCharCode(rd.u1());
  switch (tag) {
    case 'e': {
      const typeName = descriptorToInternal(cp.utf8(rd.u2()));
      const constName = cp.utf8(rd.u2());
      return { kind: 'enum', typeName, constName };
    }
    case 'c':
      return { kind: 'class', className: cp.utf8(rd.u2()) };
    case '@':
      return { kind: 'annotation', ann: parseAnnotation(rd, cp) };
    case '[': {
      const n = rd.u2();
      const values: AnnVal[] = [];
      for (let i = 0; i < n; i++) values.push(parseElementValue(rd, cp));
      return { kind: 'array', values };
    }
    default: {
      if (tag === 's') {
        return { kind: 'const', tag, value: cp.utf8(rd.u2()) };
      }
      const cv = cp.constVal(rd.u2());
      let value: number | string | bigint | boolean | undefined = cv.value;
      if (tag === 'Z') value = cv.value === 1;
      return { kind: 'const', tag, value };
    }
  }
}

function parseCode(a: RawAttr, cp: ConstantPool): CodeAttr {
  const rd = new ByteReader(a.data);
  const maxStack = rd.u2();
  const maxLocals = rd.u2();
  const codeLen = rd.u4();
  const code = rd.bytes(codeLen);
  const exCount = rd.u2();
  const exceptions: ExceptionEntry[] = [];
  for (let i = 0; i < exCount; i++) {
    const startPc = rd.u2();
    const endPc = rd.u2();
    const handlerPc = rd.u2();
    const catchIdx = rd.u2();
    exceptions.push({
      startPc,
      endPc,
      handlerPc,
      catchType: catchIdx === 0 ? null : cp.className(catchIdx),
    });
  }
  const lineNumbers: { startPc: number; line: number }[] = [];
  const localVars: LocalVarEntry[] = [];
  const localVarTypes: LocalVarEntry[] = [];
  const typeAnnotations: TypeAnnotation[] = [];
  let stackMapFrames: CodeAttr['stackMapFrames'];
  for (const at of readAttrs(rd, cp)) {
    const d = new ByteReader(at.data);
    if (isTypeAnnotations(at)) {
      typeAnnotations.push(...readTypeAnnotations(at, cp, 'code'));
    } else if (at.name === 'StackMapTable') {
      if (stackMapFrames) throw new Error('Duplicate StackMapTable');
      stackMapFrames = parseStackMap(at.data, cp);
    } else if (at.name === 'LineNumberTable') {
      const n = d.u2();
      for (let i = 0; i < n; i++) lineNumbers.push({ startPc: d.u2(), line: d.u2() });
    } else if (at.name === 'LocalVariableTable') {
      const n = d.u2();
      for (let i = 0; i < n; i++) {
        localVars.push({
          start: d.u2(),
          length: d.u2(),
          name: cp.utf8(d.u2()),
          descriptor: cp.utf8(d.u2()),
          index: d.u2(),
        });
      }
    } else if (at.name === 'LocalVariableTypeTable') {
      const n = d.u2();
      for (let i = 0; i < n; i++) {
        localVarTypes.push({
          start: d.u2(),
          length: d.u2(),
          name: cp.utf8(d.u2()),
          descriptor: cp.utf8(d.u2()),
          index: d.u2(),
        });
      }
    }
  }
  return {
    maxStack,
    maxLocals,
    code,
    exceptions,
    lineNumbers,
    localVars,
    localVarTypes,
    stackMapFrames,
    typeAnnotations,
  };
}

function parseBootstrapArg(rd: ByteReader, cp: ConstantPool): BootstrapArg {
  const idx = rd.u2();
  const cv = cp.constVal(idx);
  switch (cv.type) {
    case 'int':
      return { kind: 'int', value: cv.value as number };
    case 'float':
      return { kind: 'float', value: cv.value as number };
    case 'long':
      return { kind: 'long', value: cv.value as bigint };
    case 'double':
      return { kind: 'double', value: cv.value as number };
    case 'string':
      return { kind: 'string', value: cv.value as string };
    case 'class':
      return { kind: 'type', typeName: cv.value as string };
    case 'methodhandle':
      return { kind: 'methodHandle', handle: cp.methodHandle(idx) };
    case 'methodtype':
      return { kind: 'methodType', descriptor: cv.value as string };
    case 'dynamic':
      return { kind: 'dynamic', index: idx, ...cp.dynamic(idx) };
    default:
      throw new Error(`unsupported bootstrap arg type ${cv.type}`);
  }
}

export function parseClass(data: Uint8Array, checkName?: (name: string) => void): ClassFile {
  const r = new ByteReader(data);
  const magic = r.u4();
  if (magic !== 0xcafebabe) throw new Error(`not a class file (magic 0x${magic.toString(16)})`);
  const minorVersion = r.u2();
  const majorVersion = r.u2();
  const cp = new ConstantPool(r);
  const access = r.u2();
  const name = cp.className(r.u2());
  checkName?.(name);
  const superIdx = r.u2();
  const superName = superIdx === 0 ? null : cp.className(superIdx);
  const ifCount = r.u2();
  const interfaces: string[] = [];
  for (let i = 0; i < ifCount; i++) interfaces.push(cp.className(r.u2()));

  const cls: ClassFile = {
    minorVersion,
    majorVersion,
    access,
    name,
    superName,
    interfaces,
    fields: [],
    methods: [],
    innerClasses: [],
    nestMembers: [],
    permitted: [],
    recordComponents: [],
    bootstrapMethods: [],
    annotations: [],
    unknownAttrs: [],
    cp,
  };
  const fCount = r.u2();
  for (let i = 0; i < fCount; i++) {
    const fAccess = r.u2();
    const fName = cp.utf8(r.u2());
    const fDesc = cp.utf8(r.u2());
    parseFieldDescriptor(fDesc);
    const f: FieldInfo = {
      access: fAccess,
      name: fName,
      descriptor: fDesc,
      annotations: [],
      synthetic: false,
      deprecated: false,
    };
    for (const at of readAttrs(r, cp)) {
      if (isTypeAnnotations(at))
        (f.typeAnnotations ??= []).push(...readTypeAnnotations(at, cp, 'field'));
      const d = new ByteReader(at.data);
      switch (at.name) {
        case 'ConstantValue': {
          const cv = cp.constVal(d.u2());
          f.constantValue = {
            tag: cv.type,
            value: cv.value,
            ...(cv.rawBits !== undefined ? { rawBits: cv.rawBits } : {}),
          };
          break;
        }
        case 'Signature':
          f.signature = cp.utf8(d.u2());
          break;
        case 'Synthetic':
          f.synthetic = true;
          break;
        case 'Deprecated':
          f.deprecated = true;
          break;
        case 'RuntimeVisibleAnnotations':
        case 'RuntimeInvisibleAnnotations':
          for (const x of readAnnotations(d, cp)) f.annotations.push(x);
          break;
      }
    }
    cls.fields.push(f);
  }

  const mCount = r.u2();
  for (let i = 0; i < mCount; i++) {
    const mAccess = r.u2();
    const mName = cp.utf8(r.u2());
    const mDesc = cp.utf8(r.u2());
    parseMethodDescriptor(mDesc);
    const m: MethodInfo = {
      access: mAccess,
      name: mName,
      descriptor: mDesc,
      thrown: [],
      annotations: [],
      paramAnnotations: [],
      synthetic: false,
      deprecated: false,
    };
    for (const at of readAttrs(r, cp)) {
      if (isTypeAnnotations(at))
        (m.typeAnnotations ??= []).push(...readTypeAnnotations(at, cp, 'method'));
      const d = new ByteReader(at.data);
      switch (at.name) {
        case 'Code':
          m.code = parseCode(at, cp);
          break;
        case 'Exceptions': {
          const n = d.u2();
          for (let j = 0; j < n; j++) m.thrown.push(cp.className(d.u2()));
          break;
        }
        case 'Signature':
          m.signature = cp.utf8(d.u2());
          break;
        case 'Synthetic':
          m.synthetic = true;
          break;
        case 'Deprecated':
          m.deprecated = true;
          break;
        case 'MethodParameters': {
          const n = d.u1();
          const ps: { name: string | null; access: number }[] = [];
          for (let j = 0; j < n; j++) {
            const nIdx = d.u2();
            ps.push({ name: nIdx === 0 ? null : cp.utf8(nIdx), access: d.u2() });
          }
          m.methodParameters = ps;
          break;
        }
        case 'AnnotationDefault':
          m.annotationDefault = parseElementValue(d, cp);
          break;
        case 'RuntimeVisibleAnnotations':
          for (const x of readAnnotations(d, cp)) m.annotations.push(x);
          break;
        case 'RuntimeInvisibleAnnotations':
          for (const x of readAnnotations(d, cp)) m.annotations.push(x);
          break;
        case 'RuntimeVisibleParameterAnnotations':
        case 'RuntimeInvisibleParameterAnnotations': {
          const n = d.u1();
          for (let p = 0; p < n; p++) {
            const list = readAnnotations(d, cp);
            if (!m.paramAnnotations[p]) m.paramAnnotations[p] = [];
            m.paramAnnotations[p].push(...list);
          }
          break;
        }
      }
    }
    cls.methods.push(m);
  }

  for (const at of readAttrs(r, cp)) {
    if (isTypeAnnotations(at)) {
      (cls.typeAnnotations ??= []).push(...readTypeAnnotations(at, cp, 'class'));
      continue;
    }
    const d = new ByteReader(at.data);
    switch (at.name) {
      case 'SourceFile':
        cls.sourceFile = cp.utf8(d.u2());
        break;
      case 'Signature':
        cls.signature = cp.utf8(d.u2());
        break;
      case 'InnerClasses': {
        const n = d.u2();
        for (let i = 0; i < n; i++) {
          const inner = cp.className(d.u2());
          const outerIdx = d.u2();
          const nameIdx = d.u2();
          const icAccess = d.u2();
          const info: InnerClassInfo = {
            inner,
            outer: outerIdx === 0 ? null : cp.className(outerIdx),
            innerName: nameIdx === 0 ? null : cp.utf8(nameIdx),
            access: icAccess,
          };
          cls.innerClasses.push(info);
        }
        break;
      }
      case 'EnclosingMethod': {
        const encClass = cp.className(d.u2());
        const mIdx = d.u2();
        if (mIdx === 0) cls.enclosing = { class: encClass, method: null, descriptor: null };
        else {
          const nt = cp.nat(mIdx);
          cls.enclosing = { class: encClass, method: nt.name, descriptor: nt.descriptor };
        }
        break;
      }
      case 'NestHost':
        cls.nestHost = cp.className(d.u2());
        break;
      case 'NestMembers': {
        const n = d.u2();
        for (let i = 0; i < n; i++) cls.nestMembers.push(cp.className(d.u2()));
        break;
      }
      case 'PermittedSubclasses': {
        const n = d.u2();
        for (let i = 0; i < n; i++) cls.permitted.push(cp.className(d.u2()));
        break;
      }
      case 'Record': {
        const n = d.u2();
        for (let i = 0; i < n; i++) {
          const cName = cp.utf8(d.u2());
          const cDesc = cp.utf8(d.u2());
          const comp: RecordComponent = { name: cName, descriptor: cDesc, annotations: [] };
          for (const cat of readAttrs(d, cp)) {
            if (isTypeAnnotations(cat))
              (comp.typeAnnotations ??= []).push(...readTypeAnnotations(cat, cp, 'field'));
            const cd = new ByteReader(cat.data);
            if (cat.name === 'Signature') comp.signature = cp.utf8(cd.u2());
            else if (
              cat.name === 'RuntimeVisibleAnnotations' ||
              cat.name === 'RuntimeInvisibleAnnotations'
            ) {
              for (const x of readAnnotations(cd, cp)) comp.annotations.push(x);
            }
          }
          cls.recordComponents.push(comp);
        }
        break;
      }
      case 'BootstrapMethods': {
        const n = d.u2();
        for (let i = 0; i < n; i++) {
          const refIdx = d.u2();
          const argc = d.u2();
          const args: BootstrapArg[] = [];
          for (let j = 0; j < argc; j++) args.push(parseBootstrapArg(d, cp));
          const bm: BootstrapMethod = { ref: cp.methodHandle(refIdx), args };
          cls.bootstrapMethods.push(bm);
        }
        break;
      }
      case 'Synthetic':
        cls.access |= 0x1000;
        break;
      case 'Deprecated':
        break;
      case 'RuntimeVisibleAnnotations':
      case 'RuntimeInvisibleAnnotations':
        for (const x of readAnnotations(d, cp)) cls.annotations.push(x);
        break;
      default:
        cls.unknownAttrs.push(at.name);
    }
  }
  return cls;
}

function readAnnotations(d: ByteReader, cp: ConstantPool): Ann[] {
  const n = d.u2();
  const out: Ann[] = [];
  for (let i = 0; i < n; i++) out.push(parseAnnotation(d, cp));
  return out;
}

function isTypeAnnotations(attr: RawAttr): boolean {
  return (
    attr.name === 'RuntimeVisibleTypeAnnotations' || attr.name === 'RuntimeInvisibleTypeAnnotations'
  );
}

function readTypeAnnotations(
  attr: RawAttr,
  cp: ConstantPool,
  location: 'class' | 'field' | 'method' | 'code',
): TypeAnnotation[] {
  const rd = new ByteReader(attr.data);
  const count = rd.u2();
  const result: TypeAnnotation[] = [];
  const allowed = {
    class: [0x00, 0x10, 0x11],
    field: [0x13],
    method: [0x01, 0x12, 0x14, 0x15, 0x16, 0x17],
    code: [0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x4b],
  };
  for (let i = 0; i < count; i++) {
    const targetType = rd.u1();
    if (!allowed[location].includes(targetType))
      throw new Error(`Invalid type annotation target ${targetType} on ${location}`);
    const entry: Omit<TypeAnnotation, 'annotation'> = {
      targetType,
      path: [],
      visible: attr.name === 'RuntimeVisibleTypeAnnotations',
    };
    if ([0x00, 0x01, 0x16].includes(targetType)) entry.index = rd.u1();
    else if ([0x10, 0x17, 0x42].includes(targetType)) entry.index = rd.u2();
    else if ([0x11, 0x12].includes(targetType)) {
      entry.index = rd.u1();
      entry.boundIndex = rd.u1();
    } else if (targetType === 0x40 || targetType === 0x41) {
      entry.table = [];
      const ranges = rd.u2();
      for (let j = 0; j < ranges; j++)
        entry.table.push({ start: rd.u2(), length: rd.u2(), index: rd.u2() });
    } else if (targetType >= 0x43) {
      entry.offset = rd.u2();
      if (targetType >= 0x47) entry.typeArgumentIndex = rd.u1();
    }
    const length = rd.u1();
    for (let j = 0; j < length; j++) {
      const kind = rd.u1(),
        index = rd.u1();
      if (kind > 3 || (kind !== 3 && index !== 0)) throw new Error('Invalid type annotation path');
      entry.path.push({ kind, index });
    }
    result.push({ ...entry, annotation: parseAnnotation(rd, cp) });
  }
  if (rd.remaining) throw new Error('Trailing type annotation bytes');
  return result;
}
