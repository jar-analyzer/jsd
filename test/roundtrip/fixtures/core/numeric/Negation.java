public class Negation {

  static int integer(int x) {
    return -(-x);
  }

  static long wide(long x) {
    return -(-x);
  }

  static double floating(double x) {
    return -(-x);
  }

  static float single(float x) {
    return -(-x);
  }

  public static void main(String[] args) {
    System.out.println(integer(3));
    System.out.println(wide(3));
    System.out.println(floating(3));
    System.out.println(single(3));
    System.out.println(1 / floating(-0.0));
  }
}
