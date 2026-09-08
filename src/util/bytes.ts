export class ByteReader {
  private pos = 0;
  constructor(public readonly data: Uint8Array) {}

  get offset(): number {
    return this.pos;
  }
  seek(p: number): void {
    if (p < 0 || p > this.data.length) throw new Error(`seek out of bounds: ${p}`);
    this.pos = p;
  }
  get remaining(): number {
    return this.data.length - this.pos;
  }
  u1(): number {
    if (this.pos >= this.data.length) throw new Error('unexpected end of data (u1)');
    return this.data[this.pos++];
  }
  u2(): number {
    if (this.pos + 2 > this.data.length) throw new Error('unexpected end of data (u2)');
    return (this.data[this.pos++] << 8) | this.data[this.pos++];
  }
  u4(): number {
    if (this.pos + 4 > this.data.length) throw new Error('unexpected end of data (u4)');
    return (
      (this.data[this.pos++] * 0x1000000 +
        (this.data[this.pos++] << 16) +
        (this.data[this.pos++] << 8) +
        this.data[this.pos++]) >>>
      0
    );
  }
  s4(): number {
    return this.u4() | 0;
  }
  bytes(n: number): Uint8Array {
    if (this.pos + n > this.data.length) throw new Error(`unexpected end of data (${n} bytes)`);
    const out = this.data.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  modifiedUtf8(b: Uint8Array): string {
    const units: string[] = [];
    for (let i = 0; i < b.length;) {
      const c = b[i++];
      if (c > 0 && c < 0x80) {
        units.push(String.fromCharCode(c));
        continue;
      }
      const continuation = (): number => {
        if (i >= b.length || (b[i] & 0xc0) !== 0x80)
          throw new Error('invalid modified UTF-8 continuation');
        return b[i++] & 0x3f;
      };
      let unit: number;
      if ((c & 0xe0) === 0xc0) {
        unit = ((c & 0x1f) << 6) | continuation();
        if (unit !== 0 && unit < 0x80) throw new Error('overlong modified UTF-8');
      } else if ((c & 0xf0) === 0xe0) {
        unit = ((c & 0x0f) << 12) | (continuation() << 6) | continuation();
        if (unit < 0x800) throw new Error('overlong modified UTF-8');
      } else throw new Error('invalid modified UTF-8 leading byte');

      units.push(String.fromCharCode(unit));
    }
    return units.join('');
  }
}

export function hexDump(data: Uint8Array, maxBytes = 64): string {
  const lines: string[] = [];
  for (let i = 0; i < Math.min(data.length, maxBytes); i += 16) {
    const slice = data.subarray(i, Math.min(i + 16, maxBytes));
    const hex = Array.from(slice)
      .map((x) => x.toString(16).padStart(2, '0'))
      .join(' ');
    lines.push(i.toString(16).padStart(4, '0') + '  ' + hex);
  }
  if (data.length > maxBytes) lines.push(`... (${data.length} bytes total)`);
  return lines.join('\n');
}
