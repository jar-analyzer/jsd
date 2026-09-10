import java.io.*;
import java.lang.annotation.*;
import java.util.function.*;

public class CodeTypeAnnotations {

  static String cast(Object value) {
    return (@CodeMark("cast") String) value;
  }

  static String local(String value) {
    @CodeMark("local")
    String text = value;
    return text;
  }

  static String allocation(String value) {
    return new @CodeMark("new") String(value);
  }

  static String[] array() {
    return new @CodeMark("element") String@CodeMark("dimension") [2];
  }

  static boolean check(Object value) {
    return value instanceof @CodeMark("instanceof") String;
  }

  static String caught() {
    try {
      throw new IllegalArgumentException("value");
    } catch (@CodeMark("catch") IllegalArgumentException error) {
      return error.getMessage();
    }
  }

  static int resource() throws IOException {
    try (
      @CodeMark("resource")
      StringReader reader = new StringReader("x")
    ) {
      return reader.read();
    }
  }

  static int reference() {
    Function<String, Integer> function = @CodeMark("reference") Integer::parseInt;
    Supplier<String> supplier = @CodeMark("constructorReference") String::new;
    return function.apply("7") + supplier.get().length();
  }

  static <T> T identity(T value) {
    return value;
  }

  static String arguments(String value) {
    Function<String, String> function = CodeTypeAnnotations::<@CodeMark(
      "referenceArgument"
    ) String>identity;
    return CodeTypeAnnotations.<@CodeMark("methodArgument") String>identity(function.apply(value));
  }

  static String constructorArguments(String value) {
    return new <@CodeMark("constructorArgument") String>TypeArgumentConstructor(value).value;
  }

  static Object intersection(Object value) {
    return (
      @CodeMark("intersectionFirst") Serializable &
      @CodeMark("intersectionSecond") Cloneable
    ) value;
  }

  static String unchangedCast(String value) {
    return (@CodeMark("unchangedCast") String) value;
  }

  static String lambda(String value) {
    Function<String, String> function = (@CodeMark("lambdaParameter") String item) -> value + item;
    return function.apply("item");
  }

  public static void main(String[] args) throws Exception {
    System.out.println(cast("value"));
    System.out.println(local("local"));
    System.out.println(allocation("new"));
    System.out.println(array().length);
    System.out.println(check("value"));
    System.out.println(caught());
    System.out.println(resource());
    System.out.println(reference());
    System.out.println(arguments("argument"));
    System.out.println(constructorArguments("constructor"));
    System.out.println(
      intersection(new String[0])
        .getClass()
        .getName()
    );
    System.out.println(unchangedCast("unchanged"));
    System.out.println(lambda("lambda"));
  }
}

@Retention(RetentionPolicy.CLASS)
@Target(ElementType.TYPE_USE)
@interface CodeMark {
  String value();
}

class TypeArgumentConstructor {

  final String value;

  <T> TypeArgumentConstructor(T value) {
    this.value = value.toString();
  }
}
