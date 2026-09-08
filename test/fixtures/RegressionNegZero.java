public class RegressionNegZero {

  static double f() {
    return -0.0d;
  }

  static float g() {
    return -0.0f;
  }

  public static void main(String[] a) {
    System.out.println(1 / f());
    System.out.println(1 / g());
  }
}
