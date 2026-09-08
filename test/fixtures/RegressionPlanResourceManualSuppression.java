public class RegressionPlanResourceManualSuppression {

  static class R implements AutoCloseable {

    public void close() {
      throw new IllegalStateException("close");
    }
  }

  public static void main(String[] args) {
    try (R r = new R()) {
      throw new IllegalArgumentException("body");
    } catch (Exception e) {
      System.out.println(e.getMessage() + ":" + e.getSuppressed().length);
    }
  }
}
