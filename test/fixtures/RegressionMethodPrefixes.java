import java.util.function.IntUnaryOperator;

public class RegressionMethodPrefixes {

  public static int lambda$business(int value) {
    return value + 1;
  }

  public static int access$business(int value) {
    return value + 2;
  }

  public static int $SWITCH_TABLE$business(int value) {
    return value + 3;
  }

  static class Nested {

    public int lambda$business() {
      return 4;
    }

    public int access$business() {
      return 5;
    }

    public int $SWITCH_TABLE$business() {
      return 6;
    }
  }

  public static void main(String[] args) throws Exception {
    System.out.println(lambda$business(1));
    System.out.println(access$business(1));
    System.out.println($SWITCH_TABLE$business(1));
    IntUnaryOperator ref = RegressionMethodPrefixes::lambda$business;
    System.out.println(ref.applyAsInt(4));
    Nested nested = new Nested();
    System.out.println(
      nested.lambda$business() + nested.access$business() + nested.$SWITCH_TABLE$business()
    );
    Runnable task = new Runnable() {
      public int lambda$business() {
        return 7;
      }

      public int access$business() {
        return 8;
      }

      public void run() {
        System.out.println(lambda$business() + access$business());
      }
    };
    task.run();
    System.out.println(
      RegressionMethodPrefixes.class.getDeclaredMethod("lambda$business", int.class).invoke(null, 9)
    );
  }
}
