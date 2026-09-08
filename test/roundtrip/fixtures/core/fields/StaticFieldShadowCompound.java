public class StaticFieldShadowCompound {

  static int x = 7;

  static int f(int x) {
    return StaticFieldShadowCompound.x++;
  }

  public static void main(String[] args) {
    System.out.println(f(2) + ":" + x);
  }
}
