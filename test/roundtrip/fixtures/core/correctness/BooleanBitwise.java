public class BooleanBitwise {

  static int n;

  static boolean yes() {
    n++;
    return true;
  }

  static boolean no() {
    n += 10;
    return false;
  }

  public static void main(String[] args) {
    boolean a = yes() & no();
    boolean b = yes() | no();
    boolean c = yes() ^ no();
    System.out.println(a + ":" + b + ":" + c + ":" + n);
  }
}
