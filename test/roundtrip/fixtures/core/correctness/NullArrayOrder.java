public class NullArrayOrder {

  static int index() {
    System.out.println("index");
    return 1;
  }

  static Object value() {
    System.out.println("value");
    return new Object();
  }

  public static void main(String[] args) {
    Object[] a = null;
    try {
      a[index()] = value();
    } catch (NullPointerException e) {
      System.out.println("null");
    }
  }
}
