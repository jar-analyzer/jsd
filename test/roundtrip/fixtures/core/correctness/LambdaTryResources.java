public class LambdaTryResources {

  static void run(String other) {
    String value = "A";
    int[] n = { 7 };
    int[] count = { 0 };
    java.util.function.IntSupplier f = () -> {
      try (java.io.StringReader reader = new java.io.StringReader(value)) {
        if (n[0] < 0) throw new IllegalArgumentException();
        return reader.read() + n[0];
      } catch (Exception e) {
        return n[0];
      } finally {
        count[0]++;
      }
    };
    System.out.println(f.getAsInt() + ":" + count[0]);
    n[0] = -2;
    System.out.println(f.getAsInt() + ":" + count[0] + ":" + other);
  }

  public static void main(String[] args) {
    run("other");
  }
}
