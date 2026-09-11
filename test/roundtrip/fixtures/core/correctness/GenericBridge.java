public class GenericBridge {

  static class A<T> {

    T f(T x) {
      return x;
    }
  }

  static class B extends A<String> {

    String f(String x) {
      return x;
    }
  }

  public static void main(String[] args) {
    A x = new B();
    try {
      System.out.println(x.f(Integer.valueOf(1)));
    } catch (ClassCastException e) {
      System.out.println("bridge");
    }
  }
}
