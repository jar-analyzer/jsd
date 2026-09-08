public class FloatRelations {

  static boolean d0(double a, double b) {
    return a < b;
  }

  static boolean dn0(double a, double b) {
    return !(a < b);
  }

  static boolean d1(double a, double b) {
    return a <= b;
  }

  static boolean dn1(double a, double b) {
    return !(a <= b);
  }

  static boolean d2(double a, double b) {
    return a > b;
  }

  static boolean dn2(double a, double b) {
    return !(a > b);
  }

  static boolean d3(double a, double b) {
    return a >= b;
  }

  static boolean dn3(double a, double b) {
    return !(a >= b);
  }

  static boolean d4(double a, double b) {
    return a == b;
  }

  static boolean dn4(double a, double b) {
    return !(a == b);
  }

  static boolean d5(double a, double b) {
    return a != b;
  }

  static boolean dn5(double a, double b) {
    return !(a != b);
  }

  static boolean f0(float a, float b) {
    return a < b;
  }

  static boolean fn0(float a, float b) {
    return !(a < b);
  }

  static boolean f1(float a, float b) {
    return a <= b;
  }

  static boolean fn1(float a, float b) {
    return !(a <= b);
  }

  static boolean f2(float a, float b) {
    return a > b;
  }

  static boolean fn2(float a, float b) {
    return !(a > b);
  }

  static boolean f3(float a, float b) {
    return a >= b;
  }

  static boolean fn3(float a, float b) {
    return !(a >= b);
  }

  static boolean f4(float a, float b) {
    return a == b;
  }

  static boolean fn4(float a, float b) {
    return !(a == b);
  }

  static boolean f5(float a, float b) {
    return a != b;
  }

  static boolean fn5(float a, float b) {
    return !(a != b);
  }

  public static void main(String[] args) {
    double[] values = {
      Double.NaN,
      Double.NEGATIVE_INFINITY,
      -1,
      -0.0,
      0.0,
      1,
      Double.POSITIVE_INFINITY,
    };
    for (double a : values) {
      for (double b : values) {
        System.out.println(d0(a, b));
        System.out.println(dn0(a, b));
        System.out.println(f0((float) a, (float) b));
        System.out.println(fn0((float) a, (float) b));
        System.out.println(d1(a, b));
        System.out.println(dn1(a, b));
        System.out.println(f1((float) a, (float) b));
        System.out.println(fn1((float) a, (float) b));
        System.out.println(d2(a, b));
        System.out.println(dn2(a, b));
        System.out.println(f2((float) a, (float) b));
        System.out.println(fn2((float) a, (float) b));
        System.out.println(d3(a, b));
        System.out.println(dn3(a, b));
        System.out.println(f3((float) a, (float) b));
        System.out.println(fn3((float) a, (float) b));
        System.out.println(d4(a, b));
        System.out.println(dn4(a, b));
        System.out.println(f4((float) a, (float) b));
        System.out.println(fn4((float) a, (float) b));
        System.out.println(d5(a, b));
        System.out.println(dn5(a, b));
        System.out.println(f5((float) a, (float) b));
        System.out.println(fn5((float) a, (float) b));
      }
    }
  }
}
