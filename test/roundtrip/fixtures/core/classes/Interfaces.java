public class Interfaces {

  interface Base {
    String name();

    default String full() {
      return "base:" + name();
    }

    static Base of(String n) {
      return () -> n;
    }
  }

  interface Mid extends Base {
    default String full() {
      return "mid:" + name() + "/" + Base.super.full();
    }
  }

  static class Impl implements Mid {

    public String name() {
      return "impl";
    }
  }

  abstract static class AbstractShape implements Base {

    final String prefix;

    AbstractShape(String prefix) {
      this.prefix = prefix;
    }

    public String name() {
      return prefix + "-shape";
    }

    abstract int weight();
  }

  static class Box extends AbstractShape {

    Box() {
      super("box");
    }

    int weight() {
      return 7;
    }
  }

  public static void main(String[] args) {
    Impl impl = new Impl();
    System.out.println(impl.name());
    System.out.println(impl.full());
    System.out.println(Base.of("lambda").full());
    AbstractShape shape = new Box();
    System.out.println(shape.name() + " " + shape.weight() + " " + shape.full());
  }
}
