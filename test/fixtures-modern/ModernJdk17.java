public class ModernJdk17 {

  sealed interface Shape permits Circle, Square {}

  record Circle(double r) implements Shape {}

  record Square(double s) implements Shape {}

  static String name(Shape sh) {
    if (sh instanceof Circle c) return "circle " + c.r();
    if (sh instanceof Square s) return "square " + s.s();
    throw new IllegalArgumentException("unknown");
  }

  public static void main(String[] args) {
    System.out.println(name(new Circle(1)) + " " + name(new Square(2)));
  }
}
