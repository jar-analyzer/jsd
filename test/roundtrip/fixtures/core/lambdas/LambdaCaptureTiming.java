import java.io.Serializable;
import java.util.function.Supplier;

public class LambdaCaptureTiming {

  static int calls;
  static String value = "before";

  static String next() {
    calls++;
    return value;
  }

  static Supplier<String> capture(String text) {
    return () -> text + text;
  }

  static Supplier<String> reference() {
    return (Supplier<String> & Serializable) next()::toString;
  }

  public static void main(String[] args) {
    Supplier<String> ref = reference();
    Supplier<String> lambda = capture(next());
    value = "after";
    System.out.println(calls);
    System.out.println(ref.get());
    System.out.println(ref.get());
    System.out.println(lambda.get());
    System.out.println(calls);
    value = null;
    try {
      reference();
      System.out.println("wrong");
    } catch (NullPointerException expected) {
      System.out.println("creation failed");
    }
  }
}
