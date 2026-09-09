public class ShortCircuitSharedArms {

  static int calls;

  static boolean check(boolean value) {
    calls++;
    return value;
  }

  static int or(boolean a, boolean b, boolean c) {
    int value;
    if (check(a) || check(b) || check(c)) value = 1;
    else value = 2;
    return value;
  }

  static int and(boolean a, boolean b, boolean c) {
    int value;
    if (check(a) && check(b) && check(c)) value = 3;
    else value = 4;
    return value;
  }

  static int mixed(boolean a, boolean b, boolean c) {
    int value;
    if (check(a) || (check(b) && check(c))) value = 5;
    else value = 6;
    return value;
  }

  static int mixedAnd(boolean a, boolean b, boolean c) {
    int value;
    if (check(a) && (check(b) || check(c))) value = 7;
    else value = 8;
    return value;
  }

  public static void main(String[] args) {
    for (int i = 0; i < 8; i++) {
      boolean a = (i & 1) != 0;
      boolean b = (i & 2) != 0;
      boolean c = (i & 4) != 0;
      calls = 0;
      System.out.println(or(a, b, c));
      System.out.println(and(a, b, c));
      System.out.println(mixed(a, b, c));
      System.out.println(mixedAnd(a, b, c));
      System.out.println(calls);
    }
  }
}
