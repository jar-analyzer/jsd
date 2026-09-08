public class DiscardedCalls {

  static int calls;

  static long wide() {
    calls++;
    return 9L;
  }

  static double decimal() {
    calls += 10;
    return 0.5;
  }

  static long fail() {
    throw new IllegalStateException("expected");
  }

  public static void main(String[] args) {
    wide();
    decimal();
    new StringBuilder().append(wide()).append(decimal()).toString();
    new StringBuffer().append(wide());
    System.out.println(calls);
    try {
      fail();
    } catch (IllegalStateException ex) {
      System.out.println(ex.getMessage());
    }
  }
}
