public class RegressionUserTempCall {

  static int x;

  static int read() {
    return x++;
  }

  static int value() {
    int r1 = read();
    x += 10;
    return r1;
  }

  public static void main(String[] args) {
    System.out.print(value() + ":" + x);
  }
}
