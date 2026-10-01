public class GenericInnerDelegation {

  static String trace = "";
  final String name;

  GenericInnerDelegation(String name) {
    this.name = name;
  }

  class Inner<T extends Number> {

    Inner(T value) {
      trace += name + ":number:" + value + ";";
    }

    Inner(String value) {
      trace += name + ":string:" + value + ";";
    }

    Inner(T value, int marker) {
      this(value);
      trace += marker + ";";
    }

    Inner(String value, long marker) {
      this(value);
      trace += marker + ";";
    }

    Inner(T value, long first, double second) {
      this(value, argument(first, second));
      trace += "done;";
    }

    <V extends CharSequence> Inner(V text, byte marker) {
      trace += "generic:" + text + ":" + marker + ";";
    }

    Inner(String text, byte marker, boolean ignored) {
      this((CharSequence) text, marker);
    }

    Inner(boolean ignored) {
      this((T) null);
    }
  }

  class Plain {

    Plain(GenericInnerDelegation other, int first, int second) {
      trace += name + ":" + other.name + ":" + first + ":" + second + ";";
    }

    Plain(GenericInnerDelegation other) {
      this(other, effect(1), effect(2));
    }
  }

  static int effect(int value) {
    trace += "effect:" + value + ";";
    return value;
  }

  static int argument(long first, double second) {
    trace += "argument:" + first + ":" + second + ";";
    if (first < 0) throw new IllegalArgumentException("negative");
    return 7;
  }

  public static void main(String[] args) {
    GenericInnerDelegation outer = new GenericInnerDelegation("outer");
    outer.new Inner<Integer>(Integer.valueOf(3), 4);
    outer.new Inner<Integer>("text", 5L);
    outer.new Inner<Integer>(Integer.valueOf(6), 8L, 2.5);
    outer.new Inner<Integer>("generic", (byte) 2, true);
    outer.new Inner<Integer>(true);
    outer.new Plain(new GenericInnerDelegation("other"));
    System.out.println(trace);
    trace = "";
    try {
      outer.new Inner<Integer>(Integer.valueOf(9), -1L, 3.5);
    } catch (IllegalArgumentException failure) {
      System.out.println(trace + failure.getMessage());
    }
  }
}
