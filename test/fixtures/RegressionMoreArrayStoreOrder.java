public class RegressionMoreArrayStoreOrder {

  static String trace = "";

  static Object[] array(Object[] value) {
    trace += "a";
    return value;
  }

  static int index(int value) {
    trace += "i";
    return value;
  }

  static Object value() {
    trace += "v";
    return Integer.valueOf(42);
  }

  static void check(Object[] target, int offset) {
    trace = "";
    try {
      array(target)[index(offset)] = value();
      System.out.println(trace + ":ok:" + target[offset]);
    } catch (RuntimeException ex) {
      System.out.println(trace + ":" + ex.getClass().getSimpleName());
    }
  }

  public static void main(String[] args) {
    check(null, 0);
    check(new String[0], 0);
    check(new String[1], 0);
    check(new Object[1], 0);
  }
}
