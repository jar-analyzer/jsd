public class Constructors {

  static final StringBuilder log = new StringBuilder();

  public static void main(String[] args) {
    System.out.println(log.toString());
    Child c1 = new Child();
    Child c2 = new Child(5);
    Child c3 = new Child("x", 3);
    System.out.println(c1.sum());
    System.out.println(c2.sum());
    System.out.println(c3.sum());
  }

  static {
    log.append("static1;");
  }

  {
    log.append("instance;");
  }

  static {
    log.append("static2;");
  }

  static class Child extends Constructors {

    final int a;
    final int b;

    Child() {
      this(1, 2);
      log.append("ctor0;");
    }

    Child(int a) {
      this(a, a * 10);
      log.append("ctor1;");
    }

    Child(String tag, int a) {
      this(a);
      log.append("ctor2:").append(tag).append(';');
    }

    Child(int a, int b) {
      this.a = a;
      this.b = b;
      log.append("ctorBase;");
    }

    int sum() {
      return a + b;
    }
  }
}
