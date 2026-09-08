public class BitOps {

  public static void main(String[] args) {
    BitOps b = new BitOps();
    System.out.println(b.mix(0x5A, 0xA5));
    System.out.println(b.shifts(-8));
    System.out.println(b.swap(13, 42));
    System.out.println(b.popcount(0b11010111));
    System.out.println(b.longMix(0x123456789ABCDEFL));
  }

  int mix(int a, int b) {
    return ((a & b) | (a ^ b)) + (~a & 0xFF) + (a << 2) + (b >> 1) + (b >>> 2);
  }

  int shifts(int v) {
    int r = v;
    r <<= 2;
    r >>= 1;
    r >>>= 3;
    return r;
  }

  String swap(int a, int b) {
    a = a ^ b;
    b = a ^ b;
    a = a ^ b;
    return a + "," + b;
  }

  int popcount(int v) {
    int count = 0;
    while (v != 0) {
      v &= v - 1;
      count++;
    }
    return count;
  }

  long longMix(long v) {
    return (v << 8) | ((v >>> 24) ^ 0xFFL);
  }
}
