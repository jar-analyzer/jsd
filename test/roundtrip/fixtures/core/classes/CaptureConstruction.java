public class CaptureConstruction {

  abstract static class Base {

    String observed;

    Base(boolean fail) {
      observed = value();
      if (fail) throw new IllegalArgumentException(observed);
    }

    abstract String value();
  }

  int count;

  Base create(final long number, final String text, boolean fail) {
    count++;
    Base result = new Base(fail) {
      String value() {
        return text + ":" + number + ":" + count;
      }
    };
    return result;
  }

  public static void main(String[] args) {
    CaptureConstruction outer = new CaptureConstruction();
    Base first = outer.create(12345678901L, "first", false);
    System.out.println(first.observed);
    try {
      outer.create(99L, "failed", true);
    } catch (IllegalArgumentException error) {
      System.out.println(error.getMessage());
    }
    System.out.println(first.value());
  }
}
