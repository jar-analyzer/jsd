public class ResourceSameException {

  static final RuntimeException E = new RuntimeException("same");

  static class R implements AutoCloseable {

    public void close() {
      throw E;
    }
  }

  public static void main(String[] args) {
    try (R a = new R()) {
      throw E;
    } catch (Exception e) {
      System.out.println(e.getClass().getName());
    }
  }
}
