public class RegressionIncArg {

  static void f(long a) {
    System.out.println(a);
  }

  public static void main(String[] a) {
    int x = 1;
    f(x++);
    System.out.println(x);
  }
}
