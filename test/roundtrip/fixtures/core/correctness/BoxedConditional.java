public class BoxedConditional {

  static Object f(boolean b) {
    Object x;
    if (b) x = Integer.valueOf(1);
    else x = Double.valueOf(2);
    return x;
  }

  static Object g(boolean b) {
    Object x;
    if (b) x = (Integer) null;
    else x = Double.valueOf(2);
    return x;
  }

  public static void main(String[] args) {
    System.out.println(f(true).getClass() + ":" + f(true) + ":" + f(false) + ":" + g(true));
  }
}
