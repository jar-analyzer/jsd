public class RegressionPlanStaticShadowWrite {

  static int x = 7;

  static void f(int x) {
    RegressionPlanStaticShadowWrite.x = x;
  }

  public static void main(String[] args) {
    f(2);
    System.out.println(x);
  }
}
