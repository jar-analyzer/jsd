public class RegressionBounds {

  static <T extends Runnable & java.io.Serializable & Cloneable> void use(T value) {
    value.run();
  }

  public static void main(String[] args) {
    System.out.print("ok");
  }
}
