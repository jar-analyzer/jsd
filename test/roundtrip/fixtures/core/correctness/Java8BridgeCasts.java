import java.io.Serializable;

public class Java8BridgeCasts {

  interface Identity<T> {
    default T value(T input) {
      return input;
    }
  }

  static class Strings implements Identity<String> {

    public String value(String input) {
      return Identity.super.value(input);
    }
  }

  static String pick(Object value) {
    return "object:" + value;
  }

  static String pick(String value) {
    return "string:" + value;
  }

  public static void main(String[] args) {
    try {
      ((Runnable & Serializable) (Object) "wrong").run();
    } catch (ClassCastException expected) {
      System.out.println("intersection");
    }
    Identity<String> typed = new Strings();
    System.out.println(pick((Object) typed.value("typed")));
    Identity raw = typed;
    try {
      raw.value(Integer.valueOf(1));
    } catch (ClassCastException expected) {
      System.out.println("default bridge");
    }
  }
}
