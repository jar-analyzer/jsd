public class RegressionEdgeResourceSuppression {

  static String trace;

  static class Resource implements AutoCloseable {

    String name;
    boolean fail;

    Resource(String name, boolean fail) {
      this.name = name;
      this.fail = fail;
      trace += "+" + name;
    }

    public void close() {
      trace += "-" + name;
      if (fail) throw new IllegalStateException(name);
    }
  }

  static void run(boolean bodyFails, boolean closeFails) {
    trace = "";
    try (Resource a = new Resource("A", closeFails); Resource b = new Resource("B", closeFails)) {
      trace += "body";
      if (bodyFails) throw new IllegalArgumentException("body");
    } catch (RuntimeException ex) {
      System.out.println(ex.getMessage());
      for (Throwable suppressed : ex.getSuppressed())
        System.out.println("suppressed:" + suppressed.getMessage());
    }
    System.out.println(trace);
  }

  public static void main(String[] args) {
    run(false, false);
    run(true, false);
    run(false, true);
    run(true, true);
  }
}
