public class ModernJdk21 {

  sealed interface Shape permits Circle, Rect {}

  record Circle(double r) implements Shape {}

  record Rect(double w, double h) implements Shape {}

  static double area(Shape sh) {
    return switch (sh) {
      case Circle c -> Math.PI * c.r() * c.r();
      case Rect(double w, double h) -> w * h;
    };
  }

  public static void main(String[] args) {
    System.out.println((int) area(new Circle(2)) + " " + (int) area(new Rect(3, 4)));
  }
}
