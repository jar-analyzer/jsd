# CHANGELOG

## 1.3.0

release date:

changelog:

- Restore legal source syntax for reference casts.
- Preserve reference checks in instanceof expressions.
- Restore casts for generic return values.
- Adapt merged integer values to boolean call arguments.
- Remove redundant casts from standard collection calls.
- Fix calls to generic collection superclass methods.
- Preserve erased generic results during overload resolution.
- Remove redundant synthetic local copies.
- Inline safe single-use synthetic values.
- Remove unused temporary variables for call results.
- Preserve anonymous-class method visibility.
- Preserve anonymous-class strictfp flags.
- Preserve interface-method strictfp flags.
- Preserve anonymous-class native methods.
- Restore generic inner-class constructor signatures.
- Fix generic inner-class construction.
- Qualify nested member-class type names.

更新内容:

- 恢复引用类型转换的合法源码写法。
- 保留 instanceof 表达式中的引用类型检查。
- 恢复泛型返回值所需的类型转换。
- 将合并后的整数值正确转换为布尔调用实参。
- 消除标准集合调用中的多余强制类型转换。
- 修复泛型集合父类的方法调用。
- 保留重载选择所需的泛型擦除返回值类型。
- 消除冗余的合成局部变量复制。
- 内联可安全合并的单次使用中间值。
- 去除无用的调用结果临时变量。
- 保留匿名类方法的访问权限。
- 保留匿名类方法的 strictfp 标志。
- 保留接口方法的 strictfp 标志。
- 保留匿名类的 native 方法。
- 恢复泛型内部类构造器签名。
- 修复泛型内部类构造表达式。
- 补全嵌套成员类类型的限定名。

## 1.2.0

release date: 2026.09.12

changelog:

- Improve Java formatting and reduce redundant casts and locals.
- Preserve evaluation order, local values, scopes and short-circuit operands.
- Preserve external primitive field writes and dollar signs in class names.
- Restore legacy private-access bridges and class initialization semantics.
- Fix conditional exits from static initializers.
- Preserve builder string identity and null append overloads.
- Fix lambda captures, nested lambdas and primitive method references.
- Correct reference, array and generic type recovery.
- Preserve resource exception handlers.
- Restore enum, record and type-use annotations, including JDK 8 inputs.
- Preserve Java 25 constructor prologues and enum constant bodies.
- Preserve boolean narrowing and float NaN payloads.
- Report duplicate class replacements.
- Synchronize demo and bilingual size data with CI checks.
- Show enclosing classes in demo navigation without hiding standalone dollar names.
- Keep demo line numbers fixed at the left across source changes and scrolling.
- Report damaged legacy inner accessors without aborting decompilation.
- Expand regression coverage.

更新内容:

- 改善 Java 格式，减少冗余转换和局部变量。
- 保留求值顺序、局部变量值、作用域和短路操作数。
- 保留外部基本类型字段写入和类名中的 $ 符号。
- 恢复旧版私有访问桥接，保留类初始化语义。
- 修复静态初始化器中的条件退出。
- 保留字符串构建器的结果身份和 null 追加重载。
- 修复 lambda 捕获、嵌套 lambda 和基本类型方法引用。
- 修正引用、数组和泛型类型恢复。
- 保留资源管理中的异常处理分支。
- 恢复枚举、record 和类型使用注解，兼容 JDK 8 输入。
- 保留 Java 25 构造器前置语句和枚举常量类体。
- 保留 boolean 窄化和 float NaN 原始位模式。
- 报告同名类覆盖。
- 同步 demo 和双语体积数据，并接入 CI 校验。
- Demo 导航合并内部类条目，保留独立的 $ 类名。
- 修复 demo 行号列随源码长度和滚动偏移的问题。
- 修复旧版内部类访问器损坏时反编译崩溃的问题。
- 扩充回归测试覆盖。

## 1.1.0

release date: 2026.09.09

- Improve dynamic bytecode support.
- Improve lambda and method reference recovery.
- Preserve field access and overload semantics.
- Preserve expression evaluation order.
- Preserve array initialization semantics.
- Preserve anonymous class initialization and locking behavior.
- Improve generic and sealed type recovery.
- Avoid misidentifying compiler-generated code.
- Improve control-flow recovery.
- Preserve exception cleanup semantics.
- Preserve record constructor bodies.
- Strengthen class-file and bytecode validation.
- Enforce configurable resource limits.
- Refine the demo.
- Expand regression coverage.
- Organize test suites, fixture names and independent CI workflows.

## 1.0.3

release date: 2026.09.08

- first version
