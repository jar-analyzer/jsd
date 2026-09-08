public class LambdaParameterSyntax {

  public static void main(String[] args) {
    String s = " hi ".repeat(2);
    System.out.println(
      s.strip() + "|" + s.isBlank() + "|" + "  ".isBlank() + "|" + s.lines().count()
    );
    java.util.function.Function<Integer, Integer> f = (var x) -> x + 1;
    System.out.println(f.apply(41));
  }
}
