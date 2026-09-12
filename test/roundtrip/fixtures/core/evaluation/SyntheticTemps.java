public class SyntheticTemps {

  static int trace;

  static int effect(int value) {
    trace = trace * 10 + value;
    if (value < 0) throw new IllegalArgumentException("negative");
    return value + 1;
  }

  static int direct(int value) {
    int ignored;
    return (ignored = effect(value));
  }

  static int arithmetic(int value) {
    int ignored;
    return (ignored = value + 1) * 2;
  }

  static String reference(String value) {
    String ignored;
    return (ignored = value.trim());
  }

  static int ordered() {
    int ignored;
    return (ignored = effect(1)) + effect(2);
  }

  static int snapshot(int value) {
    return value + (value += 2) + value;
  }

  static int unused() {
    int ignored;
    ignored = effect(3);
    return trace;
  }

  static int repeated() {
    int saved = effect(4);
    return saved + saved;
  }

  static int checked(int value) {
    try {
      return direct(value);
    } finally {
      trace = trace * 10 + 5;
    }
  }

  public static void main(String[] args) {
    trace = 0;
    System.out.println(direct(1) + ":" + trace);
    System.out.println(arithmetic(3));
    System.out.println(reference(" text "));
    trace = 0;
    System.out.println(ordered() + ":" + trace);
    System.out.println(snapshot(2));
    trace = 0;
    System.out.println(unused());
    trace = 0;
    System.out.println(repeated() + ":" + trace);
    trace = 0;
    try {
      checked(-1);
    } catch (IllegalArgumentException failure) {
      System.out.println(failure.getMessage() + ":" + trace);
    }
  }
}
