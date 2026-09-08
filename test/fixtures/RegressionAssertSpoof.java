public class RegressionAssertSpoof {

  static boolean $assertionsDisabledUser = true;

  static boolean test() {
    return true;
  }

  static void work() {
    if ($assertionsDisabledUser && test()) throw new AssertionError("business");
  }

  public static void main(String[] args) {
    try {
      work();
      System.out.print("missed");
    } catch (AssertionError e) {
      System.out.print("caught");
    }
  }
}
