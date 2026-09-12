public class AnonymousStrict {

  public static void main(String[] a) throws Exception {
    Object x = new Object() {
      public strictfp double f(double x) {
        return x * 2;
      }
    };
    System.out.println(
      java.lang.reflect.Modifier.isStrict(
        x.getClass().getDeclaredMethod("f", double.class).getModifiers()
      )
    );
  }
}
