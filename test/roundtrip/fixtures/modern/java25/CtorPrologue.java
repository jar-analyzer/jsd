public class CtorPrologue {

  static class Base {

    Base(int x) {
      System.out.println("base:" + x);
    }
  }

  static class Child extends Base {

    Child(int x) {
      System.out.println("before");
      int y = x + 1;
      if (y < 0) throw new IllegalArgumentException();
      super(y);
      System.out.println("after");
    }
  }

  public static void main(String[] args) {
    new Child(1);
    try {
      new Child(-2);
    } catch (IllegalArgumentException e) {
      System.out.println("rejected");
    }
  }
}
