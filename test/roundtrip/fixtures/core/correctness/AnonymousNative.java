public class AnonymousNative {

  public static void main(String[] a) throws Exception {
    Object x = new Object() {
      public native int f();

      private synchronized native int hidden(int value) throws java.io.IOException;
    };
    System.out.println(
      java.lang.reflect.Modifier.isNative(x.getClass().getDeclaredMethod("f").getModifiers())
    );
    java.lang.reflect.Method hidden = x.getClass().getDeclaredMethod("hidden", int.class);
    System.out.println(
      java.lang.reflect.Modifier.isPrivate(hidden.getModifiers()) +
        ":" +
        java.lang.reflect.Modifier.isSynchronized(hidden.getModifiers()) +
        ":" +
        java.lang.reflect.Modifier.isNative(hidden.getModifiers()) +
        ":" +
        hidden.getExceptionTypes()[0].getName()
    );
    try {
      x.getClass().getDeclaredMethod("f").invoke(x);
    } catch (java.lang.reflect.InvocationTargetException failure) {
      System.out.println(failure.getCause().getClass().getName());
    }
  }
}
