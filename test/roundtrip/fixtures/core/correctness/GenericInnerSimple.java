public class GenericInnerSimple {

  static class A<T> {

    class B {

      T t;

      B(T t) {
        this.t = t;
      }

      T get() {
        return t;
      }
    }
  }

  public static void main(String[] a) {
    A<String> x = new A<String>();
    System.out.println(x.new B("ok").get());
  }
}
