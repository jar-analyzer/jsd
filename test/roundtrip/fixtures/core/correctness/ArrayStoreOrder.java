public class ArrayStoreOrder {

  static Object value() {
    System.out.println("value");
    return new Object();
  }

  public static void main(String[] args) {
    Object[] a = new String[0];
    try {
      a[1] = value();
    } catch (ArrayIndexOutOfBoundsException e) {
      System.out.println("bounds");
    }
  }
}
