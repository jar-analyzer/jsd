import java.lang.annotation.*;

public class RecordDeclarationAnnotations {

  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.FIELD)
  @interface F {
    int value();
  }

  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.RECORD_COMPONENT)
  @interface C {
    int value();
  }

  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.PARAMETER)
  @interface P {
    int value();
  }

  @Retention(RetentionPolicy.RUNTIME)
  @Target({
    ElementType.FIELD,
    ElementType.METHOD,
    ElementType.PARAMETER,
    ElementType.RECORD_COMPONENT,
  })
  @interface All {
    int value();
  }

  record R(@F(1) @C(2) @P(3) @All(4) int n) {}

  record Explicit(int n) {
    Explicit(@All(5) int n) {
      this.n = n;
    }
  }

  record Unpropagated(@All(6) int n) {
    Unpropagated(int n) {
      this.n = n;
    }

    public int n() {
      return n;
    }
  }

  public static void main(String[] args) throws Exception {
    System.out.println(
      Explicit.class.getDeclaredField("n").getAnnotations().length +
        ":" +
        Explicit.class.getRecordComponents()[0].getAnnotations().length +
        ":" +
        Explicit.class.getDeclaredConstructor(int.class).getParameterAnnotations()[0].length +
        ":" +
        Explicit.class.getDeclaredMethod("n").getAnnotations().length
    );
    System.out.println(
      Unpropagated.class.getDeclaredField("n").getAnnotations().length +
        ":" +
        Unpropagated.class.getRecordComponents()[0].getAnnotations().length +
        ":" +
        Unpropagated.class.getDeclaredConstructor(int.class).getParameterAnnotations()[0].length +
        ":" +
        Unpropagated.class.getDeclaredMethod("n").getAnnotations().length
    );
    System.out.println(
      R.class.getDeclaredField("n").getAnnotations().length +
        ":" +
        R.class.getRecordComponents()[0].getAnnotations().length +
        ":" +
        R.class.getDeclaredConstructor(int.class).getParameterAnnotations()[0].length +
        ":" +
        R.class.getDeclaredMethod("n").getAnnotations().length
    );
    System.out.println(
      R.class.getDeclaredField("n").getAnnotation(F.class).value() +
        ":" +
        R.class.getRecordComponents()[0].getAnnotation(C.class).value() +
        ":" +
        R.class.getDeclaredConstructor(int.class).getParameters()[0].getAnnotation(P.class).value()
    );
  }
}
