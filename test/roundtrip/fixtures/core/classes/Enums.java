public class Enums {

  enum Planet {
    MERCURY(3.303e+23, 2.4397e6),
    VENUS(4.869e+24, 6.0518e6),
    EARTH(5.976e+24, 6.37814e6);

    private final double mass;
    private final double radius;

    Planet(double mass, double radius) {
      this.mass = mass;
      this.radius = radius;
    }

    double surfaceGravity() {
      return (6.67300E-11 * mass) / (radius * radius);
    }
  }

  enum Op {
    ADD,
    MUL;

    int apply(int a, int b) {
      return this == ADD ? a + b : a * b;
    }
  }

  enum Simple {
    ONE,
    TWO,
    THREE,
  }

  public static void main(String[] args) {
    for (Planet p : Planet.values()) {
      System.out.printf("%s %.2f%n", p.name(), p.surfaceGravity());
    }
    System.out.println(Op.ADD.apply(3, 4) + " " + Op.MUL.apply(3, 4));
    System.out.println(Simple.ONE.ordinal() + " " + Simple.valueOf("TWO"));

    for (Simple s : Simple.values()) {
      System.out.println(classify(s));
    }
  }

  static String classify(Simple s) {
    switch (s) {
      case ONE:
        return "first";
      case TWO:
        return "second";
      default:
        return "other";
    }
  }
}
