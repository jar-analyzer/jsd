public class Exceptions {

  static int counter = 0;

  public static void main(String[] args) {
    Exceptions e = new Exceptions();
    System.out.println(e.risky(1));
    System.out.println(e.risky(5));
    System.out.println(e.risky(11));
    System.out.println(e.risky(-3));
    System.out.println(counter);
    System.out.println(e.nested(0));
    System.out.println(e.nested(1));
    System.out.println(e.nested(2));
    try {
      e.onlyFinally(7);
    } catch (RuntimeException ex) {
      System.out.println("caught " + ex.getMessage());
    }
    System.out.println(e.multiCatch(new IllegalStateException("ise")));
    System.out.println(e.multiCatch(new NumberFormatException("nfe")));
    try (
      AutoCloseableRes r = new AutoCloseableRes("A");
      AutoCloseableRes r2 = new AutoCloseableRes("B")
    ) {
      System.out.println("using " + r.name + r2.name);
    } catch (Exception ex) {
      System.out.println("twr " + ex.getMessage());
    }
    System.out.println(AutoCloseableRes.log);
  }

  int risky(int x) {
    try {
      counter++;
      if (x < 0) throw new IllegalArgumentException("negative");
      if (x > 10) throw new IllegalStateException("too big: " + x);
      return x * 2;
    } catch (IllegalArgumentException ex) {
      return -1;
    } catch (IllegalStateException ex) {
      return -2;
    } finally {
      counter += 10;
    }
  }

  int nested(int mode) {
    try {
      try {
        if (mode == 0) throw new RuntimeException("inner");
        if (mode == 1) throw new Error("err");
        return 100;
      } catch (RuntimeException ex) {
        return 200;
      }
    } catch (Error err) {
      return 300;
    } finally {
      counter++;
    }
  }

  void onlyFinally(int x) {
    try {
      if (x > 0) throw new RuntimeException("positive");
    } finally {
      counter++;
    }
  }

  String multiCatch(RuntimeException ex) {
    try {
      throw ex;
    } catch (IllegalStateException | NumberFormatException e) {
      return "specific: " + e.getMessage();
    } catch (RuntimeException e) {
      return "general";
    }
  }
}

class AutoCloseableRes implements AutoCloseable {

  static String log = "";
  final String name;

  AutoCloseableRes(String name) {
    this.name = name;
    log += "open" + name + ";";
  }

  @Override
  public void close() {
    log += "close" + name + ";";
  }
}
