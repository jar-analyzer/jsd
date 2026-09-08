import java.util.List;
import java.util.Map;

public class Java9LanguageFeatures {

  interface Logger {
    default void info(String m) {
      log("INFO", m);
    }

    private void log(String level, String m) {
      System.out.println(level + ": " + m);
    }
  }

  static class L implements Logger {}

  public static void main(String[] args) throws Exception {
    List.of(1, 2, 3).forEach(System.out::println);
    Map<String, Integer> m = Map.of("a", 1, "b", 2);
    System.out.println(m.get("a") + " " + m.get("b"));
    AutoCloseable r = () -> System.out.println("closed");
    try (r) {
      System.out.println("twr-effective-final");
    }
    new L().info("hello");
  }
}
