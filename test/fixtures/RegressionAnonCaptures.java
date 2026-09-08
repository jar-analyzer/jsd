public class RegressionAnonCaptures {

  static int calls;

  abstract static class Base {

    final int start;

    Base(int start) {
      this.start = start;
    }

    abstract long value();
  }

  static Base create(int start, long captured, String label) {
    return new Base(start) {
      final long initial = captured + 7;

      {
        calls++;
        if (label.isEmpty()) throw new IllegalArgumentException("empty");
      }

      long value() {
        return initial + start + label.length();
      }
    };
  }

  public static void main(String[] args) {
    System.out.println(create(2, 100L, "one").value());
    System.out.println(create(3, 200L, "two").value());
    try {
      create(4, 300L, "");
    } catch (IllegalArgumentException error) {
      System.out.println(error.getMessage());
    }
    System.out.println(calls);
  }
}
