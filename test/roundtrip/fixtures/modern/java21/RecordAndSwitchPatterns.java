public class RecordAndSwitchPatterns {

  sealed interface Shape permits Circle, Rect {}

  record Circle(double r) implements Shape {}

  record Rect(double w, double h) implements Shape {}

  static double area(Shape sh) {
    return switch (sh) {
      case Circle c -> Math.PI * c.r() * c.r();
      case Rect(double w, double h) -> w * h;
    };
  }

  static int stateCode(Thread.State state) {
    return switch (state) {
      case null -> -1;
      case NEW -> 0;
      default -> 1;
    };
  }

  static int checks;

  static boolean guard(String value) {
    checks++;
    return value.length() > 2;
  }

  static int guarded(Object value) {
    return switch (value) {
      case null -> -1;
      case String s when guard(s) -> s.length();
      case String s -> 0;
      case Integer n when n > 0 -> n;
      default -> -2;
    };
  }

  public static void main(String[] args) {
    System.out.println(
      guarded(null) +
        ":" +
        guarded("a") +
        ":" +
        guarded("abcd") +
        ":" +
        guarded(-1) +
        ":" +
        guarded(7) +
        ":" +
        checks
    );
    System.out.println(
      stateCode(null) + ":" + stateCode(Thread.State.NEW) + ":" + stateCode(Thread.State.RUNNABLE)
    );
    System.out.println((int) area(new Circle(2)) + " " + (int) area(new Rect(3, 4)));
  }
}
