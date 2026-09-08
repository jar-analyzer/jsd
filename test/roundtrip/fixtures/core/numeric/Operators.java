public class Operators {

  public static void main(String[] args) {
    System.out.println(Operators.bits(0b1101, 0b1011));
    System.out.println(Operators.shifts(1, 5, -1));
    System.out.println(Operators.autoBox(3, 4));
    System.out.println(Operators.castDemo(3.7, 10));
    System.out.println(Operators.ternaryChain(75));
    System.out.println(Operators.ternaryChain(120));
    System.out.println(Operators.divMod(-7, 3));
  }

  static int bits(int a, int b) {
    int and = a & b;
    int or = a | b;
    int xor = a ^ b;
    int not = ~a;
    return ((and * 1000 + or) * 1000 + xor) * 10 + (not & 0xf);
  }

  static long shifts(int base, int l, int r) {
    long left = base << l;
    long right = base >> l;
    long ur = base >>> r;
    long signShift = r >> 1;
    return left * 100000 + right * 1000 + ur * 10 + (signShift & 0x7);
  }

  static int autoBox(int a, int b) {
    Integer ia = a;
    Integer ib = b;
    Integer sum = ia + ib;
    int unboxed = sum;
    return unboxed * 10 + (ia.compareTo(ib) > 0 ? 1 : 0);
  }

  static String castDemo(double d, int i) {
    int down = (int) d;
    double up = i;
    long big = (long) (d * 100);
    Object o = "str";
    String s = (String) o;
    return down + "|" + up + "|" + big + "|" + s;
  }

  static String ternaryChain(int score) {
    String grade =
      score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
    return grade;
  }

  static String divMod(int a, int b) {
    int q = a / b;
    int r = a % b;
    return q + "r" + r;
  }
}
