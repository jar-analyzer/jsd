import java.io.StringReader;
import java.lang.annotation.ElementType;
import java.lang.annotation.Target;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

public class JavaLayout {

  @Target({ ElementType.TYPE_USE, ElementType.METHOD })
  @interface Mark {
    String[] value() default { "one", "two" };
  }

  sealed interface Shape permits Point, Box {}

  record Point(int x, int y) implements Shape {}

  static non-sealed class Box implements Shape {}

  static <@Mark T extends Number & Comparable<T>> T first(List<? extends T> values) {
    return values.get(0);
  }

  enum Mode {
    FIRST {
      int value() {
        return 1;
      }
    },
    SECOND {
      int value() {
        return 2;
      }
    };

    abstract int value();
  }

  @Mark({ "method", "value" })
  static String render(@Mark String input) throws Exception {
    List<@Mark List<? extends Number>> values = new ArrayList<>();
    values.add(List.of(1, 2));
    String @Mark [] names = { "first", "second" };
    Function<String, String> transform = (Function<String, String>) (String s) -> {
      if (s.isEmpty()) {
        return "empty";
      }
      return s + first(List.of(1));
    };
    Runnable nested = new Runnable() {
      @Override
      public void run() {
        values.add(List.of(3));
      }
    };
    nested.run();
    int total = 0;
    outer: for (int i = 0; i < 4; i++) {
      for (int j = 0; j < 3; j++) {
        if (i == 2) {
          continue outer;
        }
        total += i + j;
      }
    }
    int[][] arrays = { { 1, 2 }, { 3, 4 } };
    int shifted = total >>> 1;
    int signs = -(-1) + +(+2);
    if (shifted > 0) total++;
    else total--;
    do total--; while (total > 20);
    try (StringReader a = new StringReader(input); StringReader b = new StringReader("b")) {
      total += a.read() + b.read();
    }
    String chosen = switch (arrays[0][0]) {
      case 1, 2 -> "yes";
      default -> {
        yield "no";
      }
    };
    String text = """
    first { ; //
      second "quoted"
    last
    """;
    char quote = '\'';
    synchronized (values) {
      assert total > 0 : "bad";
    }
    return (
      transform.apply(input).trim().concat(chosen) +
      new Point(1, 2) +
      values.size() +
      names.length +
      Mode.FIRST.value() +
      signs +
      quote +
      total +
      text
    );
  }

  public static void main(String[] args) throws Exception {
    System.out.print(render("value"));
  }
}
