public class RegressionFinallyEffects {

  static String trace;

  static int execute(int mode) {
    try {
      trace += "T";
      if (mode < 0) throw new IllegalArgumentException("negative");
      return mode + 1;
    } finally {
      trace += "F";
      if (mode == 0) return 99;
    }
  }

  public static void main(String[] args) {
    for (int mode = -2; mode <= 2; mode++) {
      trace = "";
      try {
        int result = execute(mode);
        System.out.println(result + ":" + trace);
      } catch (IllegalArgumentException ex) {
        System.out.println(ex.getMessage() + ":" + trace);
      }
    }
  }
}
