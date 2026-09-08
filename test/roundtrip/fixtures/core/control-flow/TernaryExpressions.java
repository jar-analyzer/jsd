public class TernaryExpressions {

  public static void main(String[] args) {
    TernaryExpressions t = new TernaryExpressions();
    System.out.println(t.nested(3));
    System.out.println(t.nested(0));
    System.out.println(t.nested(-5));
    System.out.println(t.sideEffect(5));
    System.out.println(t.sideEffect(2));
  }

  int nested(int v) {
    return v > 0 ? (v > 2 ? v * 10 : v + 1) : v < -2 ? v * 100 : v - 1;
  }

  int sideEffect(int v) {
    int a = 0;
    int r = v > 3 ? ++a : a--;
    return r * 10 + a;
  }
}
