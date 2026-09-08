public class FloatingSpecials {

  static double reciprocal(double value) {
    return 1.0 / value;
  }

  public static void main(String[] args) {
    float[] singles = {
      Float.MIN_VALUE,
      Float.MIN_NORMAL,
      Float.MAX_VALUE,
      -Float.MIN_VALUE,
      -0.0f,
    };
    for (float value : singles) System.out.println(Float.floatToRawIntBits(value));
    double[] doubles = {
      Double.MIN_VALUE,
      Double.MIN_NORMAL,
      Double.MAX_VALUE,
      -Double.MIN_VALUE,
      -0.0,
    };
    for (double value : doubles) System.out.println(Double.doubleToRawLongBits(value));
    System.out.println(reciprocal(0.0) + ":" + reciprocal(-0.0));
  }
}
