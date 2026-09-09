public class SlotReuseAcrossCatch {

  enum Level {
    DEBUG,
    WARN,
    ERROR,
    INFO,
  }

  static Level select(String input) {
    if (input == "windows") {
      boolean ok = input.length() > 0;
      System.out.println(ok);
    }
    String command = "command";
    try {
      if (input == "throw") throw new IllegalArgumentException();
    } catch (Exception ignored) {
      System.out.println(command);
      return Level.ERROR;
    }
    Level level;
    String value = input;
    if (value == null || value.isEmpty()) {
      level = Level.INFO;
    } else {
      switch (value) {
        case "debug":
          level = Level.DEBUG;
          break;
        case "warn":
          level = Level.WARN;
          break;
        case "error":
          level = Level.ERROR;
          break;
        default:
          level = Level.INFO;
          break;
      }
    }
    return level;
  }

  public static void main(String[] args) {
    for (String value : new String[] {
      null,
      "",
      "debug",
      "warn",
      "error",
      "other",
      "windows",
      "throw",
    })
      System.out.println(select(value));
  }
}
