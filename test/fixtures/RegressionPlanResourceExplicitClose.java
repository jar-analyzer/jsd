public class RegressionPlanResourceExplicitClose {

  static int n;

  static class R implements AutoCloseable {

    public void close() {
      n++;
    }
  }

  public static void main(String[] args) {
    try (R r = new R()) {
      r.close();
    }
    System.out.println(n);
  }
}
