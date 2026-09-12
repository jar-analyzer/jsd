public class BridgeExceptionOrder {

  static String trace = "";

  interface Handler<T> {
    T apply(T value);
  }

  static class Parent<T> implements Handler<T> {

    public T apply(T value) {
      trace += "parent";
      return value;
    }
  }

  static class Child extends Parent<String> {

    public String apply(String value) {
      trace += "child";
      return value;
    }

    public String apply(Integer value) {
      trace += "integer";
      return "integer";
    }
  }

  static Handler receiver(boolean empty) {
    trace += "receiver";
    return empty ? null : new Child();
  }

  static Object argument(boolean fail) {
    trace += "argument";
    if (fail) throw new IllegalArgumentException();
    return Integer.valueOf(3);
  }

  public static void main(String[] args) {
    for (int i = 0; i < 4; i++) {
      trace = "";
      try {
        System.out.println(receiver(i % 2 == 1).apply(argument(i >= 2)));
      } catch (ClassCastException expected) {
        System.out.println(trace + ":cast");
      } catch (NullPointerException expected) {
        System.out.println(trace + ":null");
      } catch (IllegalArgumentException expected) {
        System.out.println(trace + ":argument");
      } finally {
        System.out.println("finally:" + trace);
      }
    }
    Parent raw = new Child();
    System.out.println(raw.apply("bridge"));
    Child child = new Child();
    System.out.println(child.apply(Integer.valueOf(1)));
  }
}
