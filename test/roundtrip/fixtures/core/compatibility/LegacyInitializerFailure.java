public class LegacyInitializerFailure {

  static String trace = "";

  static class Broken {

    static {
      if (fail()) throw new IllegalStateException("init");
    }

    static int touch() {
      return 1;
    }
  }

  static class Cleanup {

    static {
      try {
        if (fail()) throw new IllegalStateException("init");
      } finally {
        trace += "finally;";
      }
    }

    static int touch() {
      return 1;
    }
  }

  static class Ready {

    static final int VALUE;

    static {
      if (ready()) VALUE = 3;
      else VALUE = 5;
    }
  }

  static boolean fail() {
    trace += "fail;";
    return true;
  }

  static boolean ready() {
    trace += "ready;";
    return true;
  }

  public static void main(String[] args) {
    try {
      Broken.touch();
    } catch (ExceptionInInitializerError ex) {
      trace += "error;";
    }
    try {
      Broken.touch();
    } catch (NoClassDefFoundError ex) {
      trace += "cached;";
    }
    try {
      Cleanup.touch();
    } catch (ExceptionInInitializerError ex) {
      trace += "cleanup;";
    }
    System.out.println(Ready.VALUE);
    System.out.println(trace);
  }
}
