public class LambdaMutation {

  static class Box {

    int n;

    Box(int n) {
      this.n = n;
    }
  }

  static void array(int[] other) {
    int[] n = { 0 };
    java.util.function.IntSupplier f = () -> ++n[0];
    System.out.println(f.getAsInt() + ":" + f.getAsInt() + ":" + n[0] + ":" + other[0]);
  }

  static void field(Box other) {
    Box n = new Box(1);
    java.util.function.IntSupplier f = () -> ++n.n;
    System.out.println(f.getAsInt() + ":" + f.getAsInt() + ":" + n.n + ":" + other.n);
  }

  public static void main(String[] args) {
    array(new int[] { 9 });
    field(new Box(9));
  }
}
