public class MethodOverload {

  static void f(Object x) {
    System.out.println("obj");
  }

  static void f(String x) {
    System.out.println("str");
  }

  public static void main(String[] a) {
    f((Object) "x");
  }
}
