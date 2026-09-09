public class StringSwitchLocals {

  enum LogLevel {
    DEBUG,
    WARN,
    ERROR,
    INFO,
  }

  static int calls;

  static String next(String value) {
    calls++;
    return value;
  }

  static LogLevel select(String logLevelStr) {
    LogLevel logLevel;
    switch (logLevelStr) {
      case "debug":
        logLevel = LogLevel.DEBUG;
        break;
      case "warn":
        logLevel = LogLevel.WARN;
        break;
      case "error":
        logLevel = LogLevel.ERROR;
        break;
      default:
        logLevel = LogLevel.INFO;
        break;
    }
    return logLevel;
  }

  static void unused(String logLevelStr) {
    LogLevel logLevel;
    switch (logLevelStr) {
      case "debug":
        logLevel = LogLevel.DEBUG;
        break;
      case "warn":
        logLevel = LogLevel.WARN;
        break;
      case "error":
        logLevel = LogLevel.ERROR;
        break;
      default:
        logLevel = LogLevel.INFO;
        break;
    }
  }

  static int nested(String value) {
    try {
      switch (next(value)) {
        case "debug":
          return 1;
        case "warn":
          return 2;
        default:
          return 3;
      }
    } finally {
      calls++;
    }
  }

  public static void main(String[] args) {
    for (String value : new String[] { "debug", "warn", "error", "other" }) {
      unused(value);
      System.out.println(select(value));
      System.out.println(nested(value));
    }
    try {
      nested(null);
    } catch (NullPointerException ex) {
      System.out.println("null");
    }
    System.out.println(calls);
  }
}
