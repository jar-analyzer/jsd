public class NestedFinallyTrace {

  static String trace;

  static int run(int mode) {
    try {
      try {
        trace += "T";
        if (mode < 0) throw new IllegalArgumentException("bad");
        return 1;
      } finally {
        trace += "I";
      }
    } catch (IllegalArgumentException ex) {
      trace += "C";
      return 2;
    } finally {
      trace += "O";
    }
  }

  public static void main(String[] args) {
    for (int mode = -1; mode <= 1; mode++) {
      trace = "";
      int result = run(mode);
      System.out.println(result + ":" + trace);
    }
  }
}
