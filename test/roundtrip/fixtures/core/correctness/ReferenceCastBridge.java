import java.util.List;

public class ReferenceCastBridge {

  static String trace = "";

  static String text(String marker) {
    trace += marker;
    return "wrong";
  }

  static String argument() {
    trace += "argument";
    return "value";
  }

  static class A {}

  static class B {}

  public static void main(String[] args) {
    try {
      ((List) (Object) text("receiver")).add(argument());
    } catch (ClassCastException expected) {
      System.out.println(trace);
    }
    try {
      System.out.println((Integer) (Object) text("number"));
    } catch (ClassCastException expected) {
      System.out.println(trace);
    }
    try {
      System.out.println((long[]) (Object) new int[1]);
    } catch (ClassCastException expected) {
      System.out.println("primitive arrays");
    }
    try {
      System.out.println((Integer[]) (Object) new String[1]);
    } catch (ClassCastException expected) {
      System.out.println("reference arrays");
    }
    try {
      System.out.println((String) (Object) new int[1]);
    } catch (ClassCastException expected) {
      System.out.println("array to class");
    }
    try {
      System.out.println((int[]) (Object) text("array"));
    } catch (ClassCastException expected) {
      System.out.println(trace);
    }
    try {
      System.out.println((B) (Object) new A());
    } catch (ClassCastException expected) {
      System.out.println("unrelated classes");
    }
    String empty = null;
    System.out.println((Object) text("instance") instanceof List);
    try {
      System.out.println((java.io.Reader) (Object) new java.io.ByteArrayInputStream(new byte[0]));
    } catch (ClassCastException expected) {
      System.out.println("external classes");
    }
    try {
      ((List) (Object) empty).add(argument());
    } catch (NullPointerException expected) {
      System.out.println(trace);
    }
  }
}
