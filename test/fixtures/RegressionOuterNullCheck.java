public class RegressionOuterNullCheck {

  static int calls;

  static int value() {
    return ++calls;
  }

  static RegressionOuterNullCheck missingOuter() {
    return null;
  }

  class Member {

    final int number = value();
  }

  int local() {
    class Local {

      final int number = value();
    }
    return new Local().number;
  }

  public static void main(String[] args) {
    RegressionOuterNullCheck outer = new RegressionOuterNullCheck();
    System.out.println(outer.new Member().number);
    System.out.println(outer.local());
    try {
      missingOuter().new Member();
    } catch (NullPointerException ex) {
      System.out.println("null-outer");
    }
    System.out.println(calls);
  }
}
