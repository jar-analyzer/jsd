public class ModernJdk16AnonymousOrder {

  static int state;

  static int arg() {
    System.out.print("arg:");
    return state;
  }

  static boolean fail() {
    return true;
  }

  abstract static class Base {

    Base(int value) {
      System.out.print(value + ":" + captured() + ":");
    }

    abstract long captured();
  }

  static Base create(final long capture) {
    return new Base(arg()) {
      static {
        state = 7;
        System.out.print("init:");
      }

      long captured() {
        return capture;
      }
    };
  }

  public static void main(String[] args) {
    Base value = create(11L);
    System.out.println(state + ":" + value.captured());
    state = 0;
    try {
      new Base(arg()) {
        static {
          if (fail()) throw new IllegalStateException();
        }

        long captured() {
          return 0L;
        }
      };
    } catch (ExceptionInInitializerError error) {
      System.out.println("failed:" + state);
    }
  }
}
