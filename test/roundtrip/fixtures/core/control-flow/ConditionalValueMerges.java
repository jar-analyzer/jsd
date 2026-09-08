public class ConditionalValueMerges {

  public static void main(String[] args) {
    ConditionalValueMerges v = new ConditionalValueMerges();
    System.out.println(v.pick(0, "zero", "other"));
    System.out.println(v.pick(1, null, "fallback"));
    System.out.println(v.nested(3));
    System.out.println(v.nested(-7));
    System.out.println(v.chain("a", 1));
    System.out.println(v.chain("", 0));
    System.out.println(v.chain("abc", 5));
    System.out.println(v.boolShortCircuit(-1, 2));
    System.out.println(v.boolShortCircuit(4, 4));
    System.out.println(v.boolShortCircuit(9, 0));
    System.out.println(v.boolNot(3, 3));
    System.out.println(v.boolNot(1, 2));
  }

  String pick(int mode, String a, String b) {
    String chosen = a != null ? a : b;
    return chosen.toUpperCase();
  }

  int nested(int x) {
    int sign = x > 0 ? (x > 100 ? 2 : 1) : x < 0 ? -1 : 0;
    return sign;
  }

  String chain(String s, int n) {
    String label;
    if (s.isEmpty()) {
      label = "empty";
    } else if (n > 3) {
      label = s + n;
    } else {
      label = s;
    }
    return label;
  }

  boolean boolShortCircuit(int a, int b) {
    boolean ok = (a > 0 && b > 0) || a + b > 10;
    return ok && (a == -1 || b == 2);
  }

  boolean boolNot(int a, int b) {
    boolean no = a != b || b == 2;
    return no;
  }
}
