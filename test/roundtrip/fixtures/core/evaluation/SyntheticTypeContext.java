public class SyntheticTypeContext {

  static int calls;
  static volatile int shared;

  static <T> T create(T value) {
    calls++;
    return value;
  }

  static String pick(Object value) {
    return "object:" + value;
  }

  static String pick(String value) {
    return "string:" + value;
  }

  static String generic() {
    Object ignored;
    return pick((ignored = create("value")));
  }

  static int change() {
    shared = 9;
    return 2;
  }

  static int volatileRead() {
    int ignored;
    return (ignored = shared) + change();
  }

  static int fail(Integer boxed) {
    int ignored;
    return (ignored = boxed.intValue()) + change();
  }

  public static void main(String[] args) {
    System.out.println(generic() + ":" + calls);
    shared = 3;
    System.out.println(volatileRead() + ":" + shared);
    shared = 4;
    try {
      fail(null);
    } catch (NullPointerException failure) {
      System.out.println(failure.getClass().getName() + ":" + shared);
    }
  }
}
