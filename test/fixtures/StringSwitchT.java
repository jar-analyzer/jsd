public class StringSwitchT {

  public static void main(String[] args) {
    System.out.println(switchWithFallthrough(2));
    System.out.println(switchWithFallthrough(5));
    System.out.println(switchWithFallthrough(9));
  }

  static int switchWithFallthrough(int v) {
    int r = 0;
    switch (v) {
      case 1:
      case 2:
        r += 1;
      case 3:
        r += 2;
        break;
      case 5:
        r += 10;
        break;
      default:
        r = -1;
    }
    return r;
  }
}
