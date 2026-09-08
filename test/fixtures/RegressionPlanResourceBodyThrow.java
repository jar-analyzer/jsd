public class RegressionPlanResourceBodyThrow {

  static class R implements AutoCloseable {

    public void close() {
      System.out.print("close:");
    }
  }

  public static void main(String[] args) {
    try (R a = new R()) {
      throw new IllegalStateException("body");
    } catch (Exception e) {
      System.out.println(e.getMessage());
    }
  }
}
