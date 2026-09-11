import java.lang.annotation.*;

public class GenericReturn {

  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.TYPE_USE)
  @interface Mark {}

  static <T> java.util.List<T> empty() {
    return java.util.Collections.emptyList();
  }

  static java.util.List<String> f() {
    return GenericReturn.<@Mark String>empty();
  }

  public static void main(String[] args) {
    System.out.println(f().size());
  }
}
