public class RegressionMoreConditionalValues {

  static int calls;

  static long number(long value) {
    calls++;
    return value;
  }

  static long select(boolean first, boolean second) {
    return first ? number(Long.MIN_VALUE) : second ? number(Long.MAX_VALUE) : number(7L);
  }

  static Object reference(boolean flag, Object value) {
    return flag ? value : null;
  }

  static double zero(boolean flag) {
    return flag ? -0.0 : 0.0;
  }

  public static void main(String[] args) {
    for (boolean first : new boolean[] { false, true }) {
      for (boolean second : new boolean[] { false, true }) {
        calls = 0;
        System.out.println(select(first, second) + ":" + calls);
      }
      Object value = new Object();
      System.out.println(
        (reference(first, value) == value) + ":" + Double.doubleToRawLongBits(zero(first))
      );
    }
  }
}
