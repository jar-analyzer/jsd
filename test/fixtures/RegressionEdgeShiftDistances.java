public class RegressionEdgeShiftDistances {

  static void run(int shift) {
    int i = -123456789;
    long l = -1234567890123456789L;
    System.out.println((i << shift) + ":" + (i >> shift) + ":" + (i >>> shift));
    System.out.println((l << shift) + ":" + (l >> shift) + ":" + (l >>> shift));
  }

  public static void main(String[] args) {
    for (int shift : new int[] { -65, -33, -1, 0, 1, 31, 32, 33, 63, 64, 65 }) run(shift);
  }
}
