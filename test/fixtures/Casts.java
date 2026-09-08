public class Casts {

  public static void main(String[] args) {
    Casts c = new Casts();
    System.out.println(c.widen((byte) 100, (short) 2000, 'A'));
    System.out.println(c.narrow(300));
    System.out.println(c.chars());
    System.out.println(c.floats(1.5f));
  }

  long widen(byte b, short s, char ch) {
    int i = b + s + ch;
    long l = i;
    float f = l;
    return (long) f;
  }

  int narrow(int v) {
    byte b = (byte) v;
    short s = (short) v;
    char c = (char) v;
    return b + s + c;
  }

  String chars() {
    String out = "";
    for (char ch = 'x'; ch <= 'z'; ch++) {
      out += ch + "-" + (int) ch + ";";
    }
    return out;
  }

  String floats(float base) {
    double d = base * 3;
    float f = (float) d;
    long l = (long) f;
    int i = (int) l;
    return d + "/" + f + "/" + l + "/" + i;
  }
}
