public class RegressionEvaluationOrder {

  static int calls;

  static int touch(int value) {
    calls++;
    return value;
  }

  static int choose(int a, int b) {
    calls = 0;
    boolean condition = touch(a) > 0 && touch(b) > 0;
    int result = condition ? touch(a + b) : touch(a - b);
    return result ^ (calls << 24);
  }

  static int arguments(int a, int b, int c) {
    return a * 100 + b * 10 + c;
  }

  static int increments(int value) {
    return arguments(value++, ++value, value);
  }

  public static void main(String[] args) {
    int[] values = { Integer.MIN_VALUE, -1, 0, 1, Integer.MAX_VALUE };
    for (int a : values) {
      System.out.println(increments(a));
      for (int b : values) System.out.println(choose(a, b));
    }
  }
}
