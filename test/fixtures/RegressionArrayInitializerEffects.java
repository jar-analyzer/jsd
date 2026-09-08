public class RegressionArrayInitializerEffects {

  static int state;

  static int step(int value) {
    state = state * 10 + value;
    return value;
  }

  static int fail() {
    throw new IllegalStateException();
  }

  public static void main(String[] args) {
    int[] a = new int[] { (state = 7) };
    System.out.println(a[0] + ":" + state);
    int i = 1;
    int[] b = new int[] { ++i };
    System.out.println(b[0] + ":" + i);
    int[] c = new int[] { i++, ++i, (i = 9) };
    System.out.println(c[0] + ":" + c[1] + ":" + c[2] + ":" + i);
    state = 0;
    int[] d = new int[] { step(1), (state = 2), step(3) };
    System.out.println(d[0] + ":" + d[1] + ":" + d[2] + ":" + state);
    Object value;
    Object[] objects = new Object[] { (value = new Object()) };
    System.out.println(objects[0] == value);
    state = 0;
    try {
      int[] failed = new int[] { (state = 4), fail(), (state = 5) };
    } catch (IllegalStateException error) {
      System.out.println(state);
    }
  }
}
