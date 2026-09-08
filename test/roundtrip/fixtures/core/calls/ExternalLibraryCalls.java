import java.util.List;

public class ExternalLibraryCalls {

  public static void main(String[] args) {
    StringBuilder value = new StringBuilder("characters");
    System.out.println(ExternalCallLibrary.select((Object) value));
    ExternalCallLibrary library = new ExternalCallLibrary((Object) value);
    System.out.println(library.chosen);
    System.out.println(library.choose((Object) value));
    String text = ExternalCallLibrary.identity("generic");
    List<String> values = ExternalCallLibrary.singleton(text);
    System.out.println(values.get(0));
  }
}

class ExternalCallLibrary {

  final String chosen;

  ExternalCallLibrary(Object value) {
    chosen = "object";
  }

  ExternalCallLibrary(CharSequence value) {
    chosen = "sequence";
  }

  static String select(Object value) {
    return "object";
  }

  static String select(CharSequence value) {
    return "sequence";
  }

  String choose(Object value) {
    return "object";
  }

  String choose(CharSequence value) {
    return "sequence";
  }

  static <T> T identity(T value) {
    return value;
  }

  static <T> List<T> singleton(T value) {
    return java.util.Collections.singletonList(value);
  }
}
