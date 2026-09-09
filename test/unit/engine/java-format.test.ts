import assert from 'node:assert/strict';
import test from 'node:test';
import { formatJavaSource } from '../../../src/decompile/format/index.js';
import { javaTokens } from '../../../src/decompile/format/tokens.js';
import { WorkBudget } from '../../../src/decompile/budget.js';

const cases = {
  lambda:
    'class Demo{void run(){button.addActionListener((ActionListener)((ActionEvent e)->{Result r=current();if(r==null){show("missing; {} ()");return;}else{open(r);}}));}}',
  generics:
    'class Types<T extends Number & Comparable<T>>{java.util.Map<String,java.util.List<? extends T>> values; <R> R choose(R first,R second){return first;} void call(){this.<String>choose("a","b");int x=8>>1;boolean b=x<4&&x>0;}}',
  annotations:
    '@SuppressWarnings({"unchecked","rawtypes"}) class Annotated { @Deprecated public <T> T method(@Deprecated T value) {return value;} @interface Flag {String[] value() default {"a","b"};} }',
  arrays:
    'class Arrays{int[][] values={{1,2},{3,4}};int[] more=new int[]{1,2,3};void m(String... args){Object x=values[0][1];}}',
  controls:
    'class Loops{void run(){outer:for(int i=0;i<10;i++){while(test()){if(done()){break outer;}else{continue;}}}do{run();}while(test());synchronized(this){assert test():"failed";}}}',
  resources:
    'class Resources{void run()throws Exception{try(A first=open();B second=open()){read(first,second);}catch(IOException|RuntimeException ex){throw ex;}finally{close();}}}',
  switch:
    'class Switches{int run(String s){switch(s){case "a":case "b":return 1;default:return 2;}}int next(int x){return switch(x){case 1,2->3;case 4->{yield 5;}default->0;};}}',
  declarations:
    'package sample;import java.util.List;public sealed interface Shape permits Circle,Box{}final class Circle implements Shape{}non-sealed class Box implements Shape{}record Point(int x,int y){Point{if(x<0){throw new IllegalArgumentException();}}}',
  anonymous:
    'class Anonymous{static{init();}{init();}Runnable r=new Runnable(){@Override public void run(){call();}};void run(){consume(new Runnable(){public void run(){call();}},()->{call();});}}',
  expressions:
    'class Expressions{void run(){int x=- -1;int y=+ +x;int z=x+++y--;boolean b=!!test();x=x>0?x<2?1:2:3;Object o=(Object)(String)value();use(Type::new,this::run);double n=0x1.2p-3+.2e+4;}}',
  comments:
    'class Comments{/* punctuation { ; */void run(){call(); // trailing }\n// standalone (\nother(/* argument ) */value);}}',
  literals:
    'class Literals{String s="quoted \\\"; { // ";char c=\'\\\'\';String text="""\n    a { ; //\n      b\n    """;String 中文="值";}',
  unbraced:
    'class Compact{void run(){if(test())call();else other();for(;;)call();while(test())call();do call();while(test());}}',
};

for (const [name, source] of Object.entries(cases)) {
  test(`Java formatting preserves tokens and is idempotent: ${name}`, () => {
    for (const lineWidth of [40, 80, 120]) {
      const result = formatJavaSource(source, { lineWidth });
      assert.deepEqual(
        javaTokens(result)?.map((t) => t.text),
        javaTokens(source)?.map((t) => t.text),
      );
      assert.equal(formatJavaSource(result, { lineWidth }), result);
      assert.ok(result.endsWith('\n'));
      assert.doesNotMatch(result, /[ \t]+\n/);
    }
  });
}

test('Java block lambdas use structural indentation through casts and calls', () => {
  assert.equal(
    formatJavaSource(
      'class C{void m(){listen((Listener)((Event e)->{if(e==null){return;}run();}));}}',
    ),
    `class C {
    void m() {
        listen((Listener) ((Event e) -> {
            if (e == null) {
                return;
            }
            run();
        }));
    }
}
`,
  );
});

test('Java classic switch labels and branch bodies have distinct indentation', () => {
  assert.equal(
    formatJavaSource(
      'class C{void m(int x){switch(x){case 1:case 2:run();break;default:stop();break;}}}',
    ),
    `class C {
    void m(int x) {
        switch (x) {
            case 1:
            case 2:
                run();
                break;
            default:
                stop();
                break;
        }
    }
}
`,
  );
});

test('Java line width includes declaration prefixes and surrounding indentation', () => {
  const source =
    'class C { public static String lengthyMethodName(String firstArgument, String secondArgument, String thirdArgument) throws Exception { return service().first(firstArgument, secondArgument).second(thirdArgument); } }';
  const result = formatJavaSource(source, { lineWidth: 70 });
  assert.ok(
    result.split('\n').every((line) => line.length <= 70),
    result,
  );
  assert.match(result, /lengthyMethodName\(\n/);
  assert.equal(formatJavaSource(result, { lineWidth: 70 }), result);
});

test('Java indentation is configurable and malformed input is preserved', () => {
  assert.equal(
    formatJavaSource('class C{void m(){run();}}', { indentSize: 2 }),
    'class C {\n  void m() {\n    run();\n  }\n}\n',
  );
  for (const source of [
    'class C{',
    '"unterminated',
    '/* unterminated',
    'class \\u0043 {}',
    '('.repeat(260) + ')'.repeat(260),
  ])
    assert.equal(formatJavaSource(source), source);
  for (const value of [0, -1, NaN, Infinity, 1.5, 10001])
    assert.throws(() => formatJavaSource('class C{}', { lineWidth: value }), RangeError);
});

test('Java formatting observes cancellation, work and final output limits', () => {
  const source = 'class C{void m(){run();}}';
  for (const options of [{ maxWork: 0 }, { maxOutputChars: 1 }, { signal: AbortSignal.abort() }])
    assert.throws(() => formatJavaSource(source, {}, new WorkBudget(options)));
  const result = formatJavaSource(source);
  assert.equal(
    formatJavaSource(source, {}, new WorkBudget({ maxOutputChars: result.length })),
    result,
  );
});

test('Java type parameters and annotation defaults retain declaration layout', () => {
  const result = formatJavaSource(
    'class C{<T> T id(T value){return value;}@interface A{String[] value() default {"a","b"};}}',
  );
  assert.match(result, /<T> T id\(T value\)/);
  assert.match(result, /default \{"a", "b"\};/);
});

test('Java formatting is stable across the complete source fixture corpus', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  for (const path of readdirSync('test/roundtrip/fixtures', { recursive: true }).filter(
    (p): p is string => typeof p === 'string' && p.endsWith('.java'),
  )) {
    const source = readFileSync(`test/roundtrip/fixtures/${path}`, 'utf8');
    for (const lineWidth of [60, 120]) {
      const result = formatJavaSource(source, { lineWidth });
      assert.deepEqual(
        javaTokens(result)?.map((t) => t.text),
        javaTokens(source)?.map((t) => t.text),
        path,
      );
      assert.equal(formatJavaSource(result, { lineWidth }), result, path);
    }
  }
});

test('Java formatting preserves compilation and execution of modern syntax', async (t) => {
  const { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const version = spawnSync('javac', ['-version'], { encoding: 'utf8' });
  if (
    version.error ||
    Number((version.stdout + version.stderr).match(/javac (\d+)/)?.[1] ?? 0) < 17
  ) {
    t.skip('JDK 17+ is required');
    return;
  }
  const work = mkdtempSync(join(tmpdir(), 'jsd-format-java-'));
  try {
    const source = readFileSync('test/format/fixtures/JavaLayout.java', 'utf8');
    let expected: string | undefined;
    for (const lineWidth of [0, 60, 120]) {
      const directory = join(work, String(lineWidth));
      mkdirSync(directory);
      const result = lineWidth ? formatJavaSource(source, { lineWidth }) : source;
      assert.deepEqual(
        javaTokens(result)?.map((t) => t.text),
        javaTokens(source)?.map((t) => t.text),
      );
      writeFileSync(join(directory, 'JavaLayout.java'), result);
      const compiled = spawnSync(
        'javac',
        ['--release', '17', '-d', directory, join(directory, 'JavaLayout.java')],
        { encoding: 'utf8', timeout: 10000 },
      );
      assert.equal(compiled.status, 0, compiled.stderr);
      const executed = spawnSync('java', ['-ea', '-cp', directory, 'JavaLayout'], {
        encoding: 'utf8',
        timeout: 10000,
      });
      assert.equal(executed.status, 0, executed.stderr);
      if (expected === undefined) expected = executed.stdout;
      else assert.equal(executed.stdout, expected);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('Java unary signs and hexadecimal numbers retain lexical boundaries', () => {
  const result = formatJavaSource(
    'class C{int x=- -1;int y=(int) - 2;int z=0x1e+2;double n=0x1.ep+2;int p=+ ++x;}',
  );
  assert.match(result, /x = - -1;/);
  assert.match(result, /y = \(int\) -2;/);
  assert.match(result, /z = 0x1e \+ 2;/);
  assert.match(result, /n = 0x1.ep\+2;/);
  assert.match(result, /p = \+ \+\+x;/);
});

test('Java unbraced nested branches retain dangling-else ownership', () => {
  assert.equal(
    formatJavaSource('class C{void m(){if(a)if(b)one();else two();else three();}}'),
    `class C {
    void m() {
        if (a)
            if (b)
                one();
            else
                two();
        else
            three();
    }
}
`,
  );
});

test('Java formatting handles large member lists within a bounded work budget', () => {
  const source = `class C {${Array.from({ length: 2000 }, (_, i) => `int field${i} = ${i};`).join('')}}`;
  const result = formatJavaSource(source, {}, new WorkBudget({ maxWork: 1_000_000 }));
  assert.equal(javaTokens(result)?.length, javaTokens(source)?.length);
  assert.equal(formatJavaSource(result), result);
});

test('Java do-while tails and empty loops stay with their delimiters', () => {
  const result = formatJavaSource(
    'class C{void m(){do{run();}while(test());while(test());for(;;);}}',
  );
  assert.match(result, /\} while \(test\(\)\);/);
  assert.match(result, /\n        while \(test\(\)\);/);
  assert.doesNotMatch(result, /\n +;/);
});

test('Java statement boundaries include switch, try and labeled loop bodies', () => {
  const source =
    'class C{void m(){if(a)switch(x){default:break;}next();if(b)try{run();}catch(Exception e){fail();}finally{done();}next();if(c)label:while(a)run();next();}}';
  const result = formatJavaSource(source);
  assert.deepEqual(
    javaTokens(result)?.map((t) => t.text),
    javaTokens(source)?.map((t) => t.text),
  );
  assert.equal(result.match(/^        next\(\);$/gm)?.length, 3, result);
  assert.equal(formatJavaSource(result), result);
});

test('Java formatting options apply through the public decompiler API', async () => {
  const { decompileClassFile } = await import('../../../src/index.js');
  const { DynamicClassBuilder } = await import('../../support/dynamic-class-builder.js');
  const data = new DynamicClassBuilder('Formatted').build([0x04, 0xac], '()I');
  const result = decompileClassFile(data, {
    banner: false,
    javaFormat: { indentSize: 2, lineWidth: 80 },
  });
  assert.equal(result.status, 'success');
  assert.match(result.source, /^  public static int value\(\) \{$/m);
  assert.match(result.source, /^    return 1;$/m);
});
