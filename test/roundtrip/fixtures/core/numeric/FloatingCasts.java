public class FloatingCasts {

  public static void main(String[] args) {
    double[] values = {
      Double.NaN,
      Double.NEGATIVE_INFINITY,
      -1.5,
      -0.0,
      0.0,
      1.5,
      Double.POSITIVE_INFINITY,
    };
    for (double value : values) {
      System.out.println(
        (int) value + ":" + (long) value + ":" + (byte) value + ":" + (int) (char) value
      );
    }
  }
}
