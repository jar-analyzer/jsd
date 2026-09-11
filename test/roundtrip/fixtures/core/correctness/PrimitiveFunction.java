import java.lang.annotation.*;

public class PrimitiveFunction {

  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.TYPE_USE)
  @interface Mark {}

  public static void main(String[] args) {
    java.util.function.ToIntFunction<String> f = @Mark String::length;
    System.out.println(f.applyAsInt("abc"));
  }
}
