public class Arith {

  public static void main(String[] args) {
    Arith a = new Arith();
    a.ints();
    a.longs();
    a.floats();
    a.doubles();
    a.chars();
    a.bytesShorts();
    System.out.println(a.mix(7));
    System.out.println(Arith.staticCalc(10));
  }

  void ints() {
    int a = 17,
      b = 5;
    System.out.println(a + b + " " + (a - b) + " " + a * b + " " + a / b + " " + (a % b));
    System.out.println(
      (a << 2) + " " + (a >> 2) + " " + (a >>> 2) + " " + (-a >> 2) + " " + (-a >>> 28)
    );
    System.out.println((a & b) + " " + (a | b) + " " + (a ^ b) + " " + ~a);
    System.out.println(Integer.MIN_VALUE + " " + Integer.MAX_VALUE);
    int x = 5;
    x += 3;
    x *= 2;
    x -= 1;
    x /= 3;
    x %= 4;
    x <<= 1;
    System.out.println(x);
    int y = 10;
    y++;
    ++y;
    y--;
    --y;
    System.out.println(y++ + " " + ++y);
  }

  void longs() {
    long a = 123456789012345L,
      b = 987654321L;
    System.out.println(a / b + " " + (a % b));
    System.out.println(Long.MIN_VALUE + " " + Long.MAX_VALUE);
    long c = b * 1000L - 1;
    System.out.println(c);
    int i = 100;
    long w = i + c;
    System.out.println(w);
    System.out.println((int) (w / 1000000000L));
  }

  void floats() {
    float f = 3.5f,
      g = 2.0f;
    System.out.println(f / g + " " + (f % g));
    System.out.println(1.0f / 3.0f);
    float nan = 0.0f / 0.0f;
    float inf = 1.0f / 0.0f;
    System.out.println(nan != nan);
    System.out.println(inf > Float.MAX_VALUE);
    int fi = (int) 3.99f;
    System.out.println(fi);
  }

  void doubles() {
    double d = 3.14159265358979;
    System.out.println(d * 2.0);
    System.out.println((float) d);
    System.out.println((int) (d * 100));
    double neg = -0.0;
    System.out.println(neg == 0.0);
    System.out.println(Double.MIN_VALUE);
  }

  void chars() {
    char c = 'A';
    char d = (char) (c + 2);
    System.out.println(d);
    System.out.println((int) d);
    char e = 100;
    System.out.println(e);
    for (char ch = 'x'; ch <= 'z'; ch++) System.out.print(ch);
    System.out.println();
  }

  void bytesShorts() {
    byte b = 100;
    b += 100;
    System.out.println(b);
    short s = 30000;
    s += 10000;
    System.out.println(s);
    byte sum = (byte) (b + 5);
    System.out.println(sum);
  }

  int mix(int seed) {
    int h = seed;
    h ^= (h >>> 20) ^ (h >>> 12);
    h ^= (h >>> 7) ^ (h >>> 4);
    return h;
  }

  static int staticCalc(int n) {
    int acc = 1;
    for (int i = 2; i <= n; i++) acc *= i;
    return acc;
  }
}
