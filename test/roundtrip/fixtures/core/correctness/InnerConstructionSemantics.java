public class InnerConstructionSemantics {

  static String trace = "";

  static class Outer<T> {

    T value;

    Outer(T value) {
      this.value = value;
    }

    String implicitReceiver() {
      return new Inner<Integer>(value, Integer.valueOf(6), 15L).result();
    }

    class Inner<U extends Number> {

      T first;
      U second;
      long stamp;

      Inner(T first, U second, long stamp) {
        trace += "N";
        this.first = first;
        this.second = second;
        this.stamp = stamp;
      }

      Inner(T first, String second, long stamp) {
        trace += "S";
        this.first = first;
        this.stamp = stamp;
      }

      String result() {
        return value + ":" + first + ":" + second.intValue() + ":" + stamp;
      }
    }

    class GenericConstructor {

      String value;

      <V extends CharSequence> GenericConstructor(long stamp, V text, double number) {
        value = stamp + ":" + text.length() + ":" + number;
      }
    }
  }

  static Outer<String> receiver(boolean missing) {
    trace += "R";
    return missing ? null : new Outer<String>("outer");
  }

  static Integer argument() {
    trace += "A";
    return Integer.valueOf(7);
  }

  public static void main(String[] args) {
    Outer<String> outer = receiver(false);
    Outer<String>.Inner<Integer> inner = outer.new Inner<Integer>("first", argument(), 9L);
    System.out.println(inner.result() + ":" + trace);
    System.out.println(receiver(false).new Inner<Integer>("next", argument(), 10L).result());
    Outer raw = outer;
    Outer.Inner erased = raw.new Inner("raw", Integer.valueOf(8), 11L);
    System.out.println(erased.result());
    System.out.println(outer.implicitReceiver());
    System.out.println(outer.new Inner<Integer>("overload", "text", 12L).stamp);
    System.out.println(outer.new GenericConstructor(13L, "abc", 2.5).value);
    trace = "";
    try {
      receiver(true).new Inner<Integer>("missing", argument(), 14L);
    } catch (NullPointerException failure) {
      System.out.println(failure.getClass().getName() + ":" + trace);
    }
  }
}
