public class RegressionNaNCmp {

  static boolean f(double x) {
    return !(x < 0);
  }

  static boolean g(double x) {
    if (x < 0) return false;
    return true;
  }

  public static void main(String[] a) {
    System.out.println(f(Double.NaN));
    System.out.println(g(Double.NaN));
  }
}
