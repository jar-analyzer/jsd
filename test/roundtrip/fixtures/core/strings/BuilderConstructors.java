public class BuilderConstructors {

  static int calls;

  static int capacity() {
    calls++;
    return 8;
  }

  public static void main(String[] args) {
    System.out.println(new StringBuilder(capacity()).append("x").toString() + ":" + calls);
    System.out.println(new StringBuilder("seed").append(true).toString());
    System.out.println(new StringBuffer().append(false).append(7).toString());
    try {
      System.out.println(new StringBuilder((String) null).toString());
    } catch (NullPointerException ex) {
      System.out.println("null-seed");
    }
    try {
      System.out.println(new StringBuilder(-1).toString());
    } catch (NegativeArraySizeException ex) {
      System.out.println("negative-capacity");
    }
  }
}
