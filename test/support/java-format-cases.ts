export const javaFormatCases = {
  annotatedTypes:
    'class C{<@A(value=1) T extends Object> void m(){}java.util.List<@A(value=2) String> list;void n(String @A [] array){}}',
  separatedAngles:
    'class C{java.util.Map<String,java.util.List<Integer> > first;java.util.List<java.util.List<java.util.List<String> > > second;}',
  comparisonArguments:
    'class C{void m(A<B,C> a,D<E,F> b){run(x<y,z>w);boolean c=x<y>>z;try(A<B,C> r=open()){run();}}}',
  genericReferences: 'class C{Object f=Type::<String>method;Object g=Type::<String>new;}',
  genericComments:
    'class C{java.util.List<String // end\n> x;java.util.Map< // start\nString,Integer> y;}',
  enumBodies:
    'enum C{FIRST{public void run(){a();}},SECOND{public void run(){b();}};public abstract void run();}',
  enumComments: 'enum C{FIRST, // first\nSECOND;}',
  blockCommentGap:
    'class C{void m(){if(/* a deliberately long disabled condition */\nd!=X){run();}}}',
  argumentComments:
    'class C{void m(){run(a, // trailing\nb);run(// leading\na);run(a // last\n);}}',
  resourceComments: 'class C{void m(){try(A a=open(); // first\n B b=open()){run();}}}',
  conditionComments:
    'class C{void m(){if(a // test\n&& b){run();}for(int i=0; // start\ni<2;i++){run();}}}',
  arrayComments: 'class C{int[] a={1, // first\n2,};int[] b={1,2,};}',
  commentedTry: 'class C{void m(){if(a)try{a();}/* gap */catch(E e){b();}finally{c();}next();}}',
  commentedElse: 'class C{void m(){if(a)if(b)first();/* gap */else second();else third();next();}}',
  commentedDo: 'class C{void m(){if(a)do /* first */run();/* tail */while(b);next();}}',
  unary: 'class C{int x=~ -1;int y=+ +1;int z=- --x;boolean b=! !false;int v=x++ + +y;}',
  prefixReturn: 'class C{int x;int m(){return ++x;}int n(){return --x;}}',
  numeric: 'class C{int x=0x1e+2;long b=0b1001_0010L;double d=0x1.ep-2+.5e+2;float f=1_000.f;}',
  annotations:
    '@A class C{@A @B(value={1,2}) void m(@A final String @B [] args){}int[] a={1,2};int[] b={3,4};}',
  loops:
    'class C{void m(){outer:for(int i=0;i<10;i++)if(a)continue outer;else break;do{run();}while(b);for(;;);while(a);}}',
  nestedLambda: 'class C{void m(){run((A)((T x)->{run(y->{if(a){return;}next();});}));}}',
  switchExpression:
    'class C{int m(int x){return switch(x){case 1,2->3;case 4->{yield 5;}default->0;};}}',
  switchPattern:
    'class C{int m(Object x){return switch(x){case String s when !s.isEmpty()->s.length();case null,default->0;};}}',
  modules:
    'open module example{requires transitive other;exports example.api to first,second;uses example.Service;provides example.Service with example.Impl;}',
  declarations:
    'sealed interface Shape permits Point,Box{}record Point(int x,int y)implements Shape{}non-sealed class Box implements Shape{}',
  fields:
    'class C{int a=1,b=2;Runnable r=new Runnable(){public void run(){run();}};static{init();}{init();}}',
  textBlocks:
    'class C{String s="""\n    a { ; //\n      b\n    """;char c=\'\\\'\';String 中文="value";}',
};
