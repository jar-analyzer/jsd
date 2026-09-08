public class LambdaBridges {

  interface Base {
    Object get();
  }

  interface Narrow extends Base {
    String get();
  }

  interface Other {
    String get();
  }

  static Narrow value() {
    return (Narrow & Other) () -> "bridge";
  }

  public static void main(String[] args) {
    Narrow n = value();
    System.out.println(n.get());
    System.out.println(((Base) n).get());
    System.out.println(((Other) n).get());
  }
}
