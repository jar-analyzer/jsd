import java.lang.annotation.*;

public class GenericMixed {

  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.TYPE_USE)
  @interface Mark {}

  static <T> T choose(T a, T b) {
    return a;
  }

  static Number f() {
    return GenericMixed.<@Mark Number>choose(Integer.valueOf(1), Double.valueOf(2));
  }

  public static void main(String[] args) {
    System.out.println(f().getClass() + ":" + f());
  }
}
