public class BranchPrint {

  static int n;

  static boolean yes() {
    n++;
    return true;
  }

  static boolean no() {
    n += 10;
    return false;
  }

  static boolean flag(int count, boolean value) {
    n += count;
    return value;
  }

  static void run(boolean a, boolean b) {
    n = 0;
    System.out.println((flag(1, a) || flag(10, b)) + ":" + n);
    n = 0;
    System.out.println((flag(1, a) && flag(10, b)) + ":" + n);
  }

  public static void main(String[] args) {
    System.out.println((yes() || no()) + ":" + n);
    n = 0;
    System.out.println((no() && yes()) + ":" + n);
    run(false, false);
    run(false, true);
    run(true, false);
    run(true, true);
  }
}
