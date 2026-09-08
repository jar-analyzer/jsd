@interface A {
  Class<?> value();
}

@A(String.class)
public class ClassAnnotationLiterals {

  public static void main(String[] a) {}
}
