public class AnonymousSuperclassCapture {

  abstract static class Base {

    int observed;

    Base() {
      observed = value();
    }

    abstract int value();
  }

  static Base create(final int captured) {
    return new Base() {
      int value() {
        return captured;
      }
    };
  }

  public static void main(String[] args) {
    Base b = create(7);
    System.out.print(b.observed + ":" + b.value());
  }
}
