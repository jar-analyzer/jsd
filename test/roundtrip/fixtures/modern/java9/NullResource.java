public class NullResource {

  public static void main(String[] args) throws Exception {
    AutoCloseable a = null;
    try (a) {
      System.out.println("body");
    }
  }
}
