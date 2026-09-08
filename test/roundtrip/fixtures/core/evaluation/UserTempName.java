public class UserTempName {

  static int x = 1;

  static int value() {
    int r1 = x;
    x = 2;
    return r1;
  }

  public static void main(String[] args) {
    System.out.print(value());
  }
}
