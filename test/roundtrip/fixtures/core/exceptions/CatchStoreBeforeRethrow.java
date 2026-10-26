public class CatchStoreBeforeRethrow {

  static int attempts;
  static int cleanups;
  static int marker;
  static int[] slots = new int[3];

  static void run(int mode) throws Exception {
    try {
      if (mode == 0) throw new java.io.IOException("io");
      if (mode == 1) throw new NumberFormatException("nf");
      throw new IllegalStateException("is");
    } catch (java.io.IOException | NumberFormatException ex) {
      attempts++;
      marker = attempts;
      slots[mode] = attempts;
      throw ex;
    } finally {
      cleanups++;
    }
  }

  public static void main(String[] args) {
    for (int mode = 0; mode < 3; mode++) {
      try {
        run(mode);
      } catch (Exception ex) {
        System.out.println(
          ex.getClass().getSimpleName() +
            ":" +
            attempts +
            ":" +
            cleanups +
            ":" +
            marker +
            ":" +
            slots[0] +
            slots[1] +
            slots[2]
        );
      }
    }
  }
}
