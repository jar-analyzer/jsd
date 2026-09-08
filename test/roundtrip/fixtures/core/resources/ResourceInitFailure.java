public class ResourceInitFailure {

  static String trace;

  static class Resource implements AutoCloseable {

    String name;

    Resource(String name, boolean fail) {
      this.name = name;
      trace += "+" + name;
      if (fail) throw new IllegalArgumentException("init:" + name);
    }

    public void close() {
      trace += "-" + name;
    }
  }

  static void run(boolean fail) {
    trace = "";
    try (Resource a = new Resource("A", false); Resource b = new Resource("B", fail)) {
      trace += "body";
    } catch (IllegalArgumentException ex) {
      System.out.println(ex.getMessage());
    }
    System.out.println(trace);
  }

  public static void main(String[] args) {
    run(false);
    run(true);
  }
}
