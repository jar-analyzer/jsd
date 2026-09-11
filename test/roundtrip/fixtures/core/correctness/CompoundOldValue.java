public class CompoundOldValue {

  static int a(int x) {
    return x + (x += 2) + x;
  }

  static int b(int x) {
    return x + (x -= 2) + x;
  }

  static int call(int a, int b) {
    return a * 10 + b;
  }

  static int c(int x) {
    return call(x, (x += 2));
  }

  static int d(int x) {
    return x + (x += 2) + (x += 3) + x;
  }

  static int chain(int x) {
    int a;
    int b;
    return x + (a = x += 2) + (b = x += 3) + a + b + x;
  }

  public static void main(String[] args) {
    System.out.println(a(2) + ":" + b(5) + ":" + c(2) + ":" + d(2) + ":" + chain(2));
  }
}
