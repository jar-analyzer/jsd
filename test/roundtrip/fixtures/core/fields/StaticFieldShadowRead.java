public class StaticFieldShadowRead {

  static int x = 7;

  static int f(int x) {
    return StaticFieldShadowRead.x;
  }

  public static void main(String[] args) {
    System.out.println(f(2));
  }
}
