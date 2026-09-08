import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

public class Misc {

  static final int CONST = 42;
  static final String NAME = "misc";
  static final double RATIO = 0.5;
  static long seed = System.nanoTime() % 1000;
  static int counter;

  static {
    counter = 7;
  }

  final int id;
  private String label;

  {
    id = 5;
  }

  public static void main(String[] args) {
    System.out.println(CONST + " " + NAME + " " + RATIO);
    System.out.println(counter);
    Misc m = new Misc("lab");
    System.out.println(m.id + " " + m.label);
    m.mix(3, "x");

    Map<String, Integer> map = new HashMap<>();
    map.put("a", 1);
    map.put("b", 2);
    int sum = 0;
    for (Map.Entry<String, Integer> e : map.entrySet()) {
      sum += e.getValue();
    }
    System.out.println(sum + " " + map.get("a") + " " + map.get("z"));

    Integer boxed = 1000;
    int unboxed = boxed + 1;
    Integer fromValueOf = Integer.valueOf(7);
    System.out.println(unboxed + " " + fromValueOf);
    Boolean flag = true;
    if (flag) System.out.println("boxed true");
    Long big = 10L;
    System.out.println(big + 1);

    System.out.println(Objects.equals("a", "a") + " " + Objects.equals(null, "a"));
    System.out.println(m.hashCode() > 0);
    System.out.println(instanceOf(new Object(), new Object()));

    synchronized (Misc.class) {
      System.out.println("in class sync");
    }

    ThreadLocal<Integer> tl = ThreadLocal.withInitial(() -> 99);
    System.out.println(tl.get());
    System.out.println(m.strBuild(5));
  }

  Misc(String label) {
    this.label = label;
  }

  void mix(int a, String b) {
    String s = b;
    int v = a;
    while (v > 0) {
      s = s + ".";
      v--;
    }
    System.out.println(s);
  }

  static boolean instanceOf(Object o, Object p) {
    return o instanceof String && p instanceof Number;
  }

  String strBuild(int n) {
    StringBuilder sb = new StringBuilder("base");
    for (int i = 0; i < n; i++) sb.append('-').append(i);
    return sb.toString();
  }
}
