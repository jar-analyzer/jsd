public class Recursion {

  public static void main(String[] args) {
    Recursion r = new Recursion();
    System.out.println(r.fib(10));
    System.out.println(r.fact(6));
    System.out.println(r.gcd(48, 36));
    System.out.println(r.sum(1, 2, 3, 4, 5));
    System.out.println(r.sum());
    System.out.println(r.count(7));
    System.out.println(r.power(2, 10));
  }

  long fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
  }

  long fact(int n) {
    return n <= 1 ? 1 : n * fact(n - 1);
  }

  int gcd(int a, int b) {
    return b == 0 ? a : gcd(b, a % b);
  }

  int sum(int... vals) {
    int total = 0;
    for (int v : vals) total += v;
    return total;
  }

  long sum(long a, long b) {
    return a + b;
  }

  String count(int n) {
    if (n <= 0) return "";
    return count(n - 1) + n + ".";
  }

  int power(int base, int exp) {
    if (exp == 0) return 1;
    int half = power(base, exp / 2);
    int r = half * half;
    return exp % 2 == 0 ? r : r * base;
  }
}
