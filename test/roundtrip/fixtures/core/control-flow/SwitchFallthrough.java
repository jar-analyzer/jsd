public class SwitchFallthrough {

  static int f(int n) {
    int x = 0;
    switch (n) {
      case 0:
        x++;
      case 1:
        x += 2;
        break;
      case 2:
        x += 4;
      default:
        x += 8;
    }
    return x;
  }

  public static void main(String[] args) {
    for (int i = -1; i < 4; i++) System.out.println(f(i));
  }
}
