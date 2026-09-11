public class NestedLambda {

  static String run(String value) {
    java.util.function.Supplier<java.util.function.Supplier<String>> x = () -> () -> value;
    return x.get().get();
  }

  public static void main(String[] args) {
    System.out.println(run("captured"));
  }
}
