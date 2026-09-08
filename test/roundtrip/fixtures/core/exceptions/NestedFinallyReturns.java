public class NestedFinallyReturns {

  static String f(int n) {
    try {
      try {
        if (n == 1) return "r";
        throw new IllegalStateException();
      } finally {
        System.out.print("a");
      }
    } catch (IllegalStateException e) {
      return "e";
    } finally {
      System.out.print("b");
    }
  }

  public static void main(String[] args) {
    System.out.println(f(0));
    System.out.println(f(1));
  }
}
