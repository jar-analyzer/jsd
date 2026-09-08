public class RegressionEdgeCovariantBridge {

  interface Value<T> {
    T get();
  }

  static class Parent {

    public Number number() {
      return 1;
    }
  }

  static class Child extends Parent implements Value<String> {

    public Integer number() {
      return 7;
    }

    public String get() {
      return "child";
    }
  }

  public static void main(String[] args) {
    Child child = new Child();
    Parent parent = child;
    Value<String> typed = child;
    Value raw = child;
    System.out.println(child.number());
    System.out.println(parent.number());
    System.out.println(typed.get());
    System.out.println(raw.get());
  }
}
