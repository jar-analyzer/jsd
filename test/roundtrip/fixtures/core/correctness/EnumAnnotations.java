public class EnumAnnotations {

  @java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME)
  @java.lang.annotation.Target(java.lang.annotation.ElementType.FIELD)
  @interface Mark {
    int value();
  }

  enum E {
    @Mark(7)
    A,

    @Mark(9)
    B,
  }

  public static void main(String[] args) throws Exception {
    System.out.println(
      E.class.getField("A").getAnnotation(Mark.class).value() +
        ":" +
        E.class.getField("B").getAnnotation(Mark.class).value()
    );
  }
}
