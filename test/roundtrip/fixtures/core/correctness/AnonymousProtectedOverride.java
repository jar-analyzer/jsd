public class AnonymousProtectedOverride {

  static class A {

    protected int f() {
      return 1;
    }
  }

  public static void main(String[] a) {
    A x = new A() {
      protected int f() {
        return 2;
      }
    };
    System.out.println(x.f());
  }
}
