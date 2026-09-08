public class NestedExceptionHandlers {

  public static void main(String[] args) {
    NestedExceptionHandlers m = new NestedExceptionHandlers();
    System.out.println(m.nestedTry(1));
    System.out.println(m.nestedTry(2));
    System.out.println(m.nestedTry(3));
    System.out.println(m.finallyReturn(1));
    System.out.println(m.finallyReturn(2));
    System.out.println(m.multiCatch("n"));
    System.out.println(m.multiCatch(1));
    try {
      System.out.println(m.rethrow(0));
    } catch (IllegalStateException e) {
      System.out.println("wrapped:" + e.getCause().getClass().getSimpleName());
    }
  }

  int nestedTry(int mode) {
    try {
      if (mode == 1) throw new IllegalStateException("one");
      try {
        if (mode == 2) throw new IllegalArgumentException("two");
        return 20;
      } catch (IllegalArgumentException e) {
        return 22;
      }
    } catch (IllegalStateException e) {
      return 11;
    }
  }

  int finallyReturn(int mode) {
    int trace = 0;
    try {
      if (mode == 1) return 100;
      throw new RuntimeException("x");
    } catch (RuntimeException e) {
      return 200;
    } finally {
      trace = 1;
    }
  }

  String multiCatch(Object o) {
    try {
      if (o instanceof String) throw new java.io.IOException("io");
      if (o instanceof Integer) throw new ClassNotFoundException("cnf");
      return "ok";
    } catch (java.io.IOException | ClassNotFoundException e) {
      return "caught:" + e.getMessage();
    }
  }

  int rethrow(int v) {
    try {
      return 100 / v;
    } catch (ArithmeticException e) {
      throw new IllegalStateException("div", e);
    }
  }
}
