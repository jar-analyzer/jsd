public class AssertionModes {

  static int calls;
  static boolean $assertionsDisabledBusiness = true;
  static int this$user = 7;
  static int $SwitchMapUser = 8;
  static int $VALUES = 9;

  static boolean condition() {
    calls++;
    return false;
  }

  static String message() {
    calls += 10;
    return "assertion";
  }

  public static void main(String[] args) {
    try {
      assert condition() : message();
    } catch (AssertionError error) {
      System.out.println(error.getMessage());
    }
    try {
      if ($assertionsDisabledBusiness && !condition()) throw new AssertionError("business");
    } catch (AssertionError error) {
      System.out.println(error.getMessage());
    }
    System.out.println(calls);
    System.out.println(this$user + $SwitchMapUser + $VALUES);
  }
}
