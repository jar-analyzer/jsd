public class SwitchExpressions {

  static int dayType(int d) {
    return switch (d) {
      case 1, 7 -> 0;
      default -> 1;
    };
  }

  static String describe(int d) {
    String label = switch (d) {
      case 1 -> {
        yield "mon";
      }
      case 7 -> {
        yield "sun";
      }
      default -> {
        yield "other";
      }
    };
    return label;
  }

  public static void main(String[] args) {
    System.out.println(dayType(7) + " " + describe(1) + " " + describe(5));
  }
}
