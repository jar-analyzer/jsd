import java.util.function.Function;
import java.util.function.Supplier;

public class RegressionEdgeLambdaReferences {

  static String prefix(int base, String value) {
    return base + ":" + value;
  }

  static Function<String, String> capture(int base) {
    return value -> prefix(base, value);
  }

  public static void main(String[] args) {
    Function<String, Integer> length = String::length;
    Function<String, StringBuilder> constructor = StringBuilder::new;
    String value = "hello";
    Supplier<String> bound = value::toUpperCase;
    Function<Integer, Integer> increment = n -> n + 1;
    System.out.println(length.apply("abc"));
    System.out.println(constructor.apply("xy").length());
    System.out.println(bound.get());
    System.out.println(increment.apply(41));
    System.out.println(capture(7).apply("ok"));
  }
}
