public class RegressionCtorOverload {

  public RegressionCtorOverload(Object b) {
    System.out.println("obj");
  }

  public RegressionCtorOverload(String b) {
    System.out.println("str");
  }

  public static void main(String[] a) {
    new RegressionCtorOverload((Object) "x");
  }
}
