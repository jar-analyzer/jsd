public class AnonymousVisibility {

  public static void main(String[] a) throws Exception {
    Object x = new Object() {
      private int secret() {
        return 1;
      }

      protected int hook() {
        return 2;
      }
    };
    System.out.println(
      java.lang.reflect.Modifier.isPrivate(
        x.getClass().getDeclaredMethod("secret").getModifiers()
      ) +
        ":" +
        java.lang.reflect.Modifier.isProtected(
          x.getClass().getDeclaredMethod("hook").getModifiers()
        )
    );
  }
}
