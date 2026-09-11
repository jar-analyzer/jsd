public class LambdaTryCapture {

  static void run(int[] other) {
    int[] n = { 7 };
    java.util.function.IntSupplier f = () -> {
      try {
        return n[0];
      } catch (RuntimeException e) {
        return n[0] + 1;
      } finally {
        n[0]++;
      }
    };
    System.out.println(f.getAsInt() + ":" + n[0] + ":" + other[0]);
  }

  public static void main(String[] args) {
    run(new int[] { 99 });
  }
}
