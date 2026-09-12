public class GenericInnerEmpty {

  static class A<T> {

    class B<U> {

      B() {}

      String get() {
        return "ok";
      }
    }
  }

  public static void main(String[] a) {
    A<String> x = new A<String>();
    System.out.println(x.new B<Integer>().get());
  }
}
