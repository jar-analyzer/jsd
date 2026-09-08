public class ArrayCompound {

  static int calls;

  static int index() {
    calls++;
    return 0;
  }

  static int rhs() {
    calls += 10;
    return 3;
  }

  static void run(int start) {
    calls = 0;
    int[] a = { start };
    a[index()] += rhs();
    System.out.println(a[0] + ":" + calls);
    System.out.println(a[index()]++);
    System.out.println(++a[index()]);
    System.out.println(a[0] + ":" + calls);
  }

  public static void main(String[] args) {
    run(4);
    run(Integer.MAX_VALUE);
  }
}
