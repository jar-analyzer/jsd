import java.lang.annotation.*;

@Retention(RetentionPolicy.RUNTIME)
@interface Values {
  Class<?> type() default int.class;

  Class<?>[] types() default { String.class, int[].class, void.class };

  float fraction() default 1.5f;

  double zero() default -0.0d;

  long large() default 9223372036854775807L;

  char quote() default '\'';

  char slash() default '\\';

  String text() default "\0\r\n😀";
}

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.PARAMETER)
@interface ParameterOnly {}

@Values
public class RegressionAnnotationValues {

  public static void parameter(@ParameterOnly String value) {}

  public static void main(String[] args) throws Exception {
    Values v = RegressionAnnotationValues.class.getAnnotation(Values.class);
    System.out.println(v.type().getName());
    for (Class<?> c : v.types()) System.out.println(c.getName());
    System.out.println(v.fraction());
    System.out.println(1 / v.zero());
    System.out.println(v.large());
    System.out.println((int) v.quote());
    System.out.println((int) v.slash());
    System.out.println(v.text().length());
    System.out.println(
      RegressionAnnotationValues.class
        .getMethod("parameter", String.class)
        .getParameterAnnotations()[0]
        .length
    );
  }
}
