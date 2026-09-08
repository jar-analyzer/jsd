public class StaticInit {

  static final int A = init("A", 1);
  static int b;
  static int c = 30;
  int instance = 5;
  static final int D;

  static {
    b = 2;
    System.out.println("static-block-1");
  }

  {
    instance = instance + 1;
  }

  static {
    D = 40;
    System.out.println("static-block-2");
  }

  StaticInit() {
    instance = instance * 10;
  }

  static int init(String tag, int v) {
    System.out.println("init:" + tag);
    return v;
  }

  public static void main(String[] args) {
    System.out.println(A + " " + b + " " + c + " " + StaticInit.D);
    StaticInit s1 = new StaticInit();
    StaticInit s2 = new StaticInit();
    System.out.println(s1.instance + " " + s2.instance);
  }
}
