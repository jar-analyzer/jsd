public class InterfaceStrict {

  interface A {
    default strictfp double f(double x) {
      return x * 2;
    }

    static strictfp double g(double x) {
      return x / 2;
    }
  }

  public static void main(String[] a) throws Exception {
    System.out.println(
      java.lang.reflect.Modifier.isStrict(
        A.class.getDeclaredMethod("f", double.class).getModifiers()
      ) +
        ":" +
        java.lang.reflect.Modifier.isStrict(
          A.class.getDeclaredMethod("g", double.class).getModifiers()
        )
    );
  }
}
