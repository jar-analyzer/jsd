public class LegacyAccessorInitialization {

  static String trace = "";

  static class Holder {

    static {
      trace += "init;";
    }

    private int value;
  }

  static int read(Holder target) {
    return target.value;
  }

  public static void main(String[] args) {
    try {
      read(null);
    } catch (NullPointerException ex) {
      trace += "null;";
    }
    try {
      read(null);
    } catch (NullPointerException ex) {
      trace += "again;";
    }
    System.out.println(trace);
  }
}
