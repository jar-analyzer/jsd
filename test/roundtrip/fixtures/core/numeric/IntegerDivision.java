public class IntegerDivision {

  static void run(int a, int b) {
    try {
      System.out.println(a / b + ":" + (a % b));
    } catch (ArithmeticException ex) {
      System.out.println("zero");
    }
  }

  static void wide(long a, long b) {
    try {
      System.out.println(a / b + ":" + (a % b));
    } catch (ArithmeticException ex) {
      System.out.println("wide-zero");
    }
  }

  public static void main(String[] args) {
    run(Integer.MIN_VALUE, -1);
    run(-7, 3);
    run(7, -3);
    run(0, 1);
    run(3, 0);
    wide(Long.MIN_VALUE, -1);
    wide(-7, 3);
    wide(7, -3);
    wide(0, 1);
    wide(3, 0);
  }
}
