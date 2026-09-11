import java.lang.annotation.*;

public class GenericCast {

  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.TYPE_USE)
  @interface Mark {}

  static java.util.List<String> f(Object x) {
    return (java.util.List<@Mark String>) x;
  }

  public static void main(String[] args) {
    System.out.println(f(java.util.Arrays.asList("x")).get(0));
  }
}
