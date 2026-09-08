import java.util.Objects;

public class RegressionAnonymousOuterChecks {

  int initialized;

  Runnable create(final String value) {
    return new Runnable() {
      {
        Objects.requireNonNull(value, "payload");
        initialized++;
      }

      public void run() {
        System.out.println(value + ":" + initialized);
      }
    };
  }

  class Nested {

    int count;

    Runnable create(final Object value) {
      return new Runnable() {
        {
          Objects.requireNonNull(value);
          count++;
        }

        public void run() {
          System.out.println(count);
        }
      };
    }
  }

  public static void main(String[] args) {
    RegressionAnonymousOuterChecks outer = new RegressionAnonymousOuterChecks();
    outer.create("ok").run();
    try {
      outer.create(null);
    } catch (NullPointerException error) {
      System.out.println(error.getMessage());
    }
    Nested nested = outer.new Nested();
    nested.create("value").run();
    try {
      nested.create(null);
    } catch (NullPointerException error) {
      System.out.println("null");
    }
    System.out.println(outer.initialized + ":" + nested.count);
  }
}
