public class LegacyJdk7 {

  public static void main(String[] args) throws Exception {
    int bin = 0b1010_1010;
    long big = 1_000_000L;
    String s = "v=" + bin + "," + big + ",x" + true;
    System.out.println(s);
    String key = args.length > 0 ? "x" : "y";
    switch (key) {
      case "x":
        System.out.println("ex");
        break;
      default:
        System.out.println("why");
    }
    try (java.io.ByteArrayInputStream in = new java.io.ByteArrayInputStream(new byte[] { 1, 2 })) {
      System.out.println(in.read() + in.read());
    }
    java.util.List<String> names = new java.util.ArrayList<>();
    names.add("a");
    try {
      Object o = null;
      o.toString();
    } catch (NullPointerException | ArrayIndexOutOfBoundsException e) {
      System.out.println("mc:" + e.getClass().getSimpleName());
    }
    System.out.println(names.size());
  }
}
