public class ResourceCloseOverload {

  static int n;

  static class R implements AutoCloseable {

    public void close() {
      n++;
    }

    void close(int x) {
      n += x;
    }
  }

  public static void main(String[] args) {
    try (R r = new R()) {
      r.close(7);
    }
    System.out.println(n);
  }
}
