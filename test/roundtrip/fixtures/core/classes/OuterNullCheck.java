public class OuterNullCheck {

  static int calls;

  static int value() {
    return ++calls;
  }

  static OuterNullCheck missingOuter() {
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
    OuterNullCheck outer = new OuterNullCheck();
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
