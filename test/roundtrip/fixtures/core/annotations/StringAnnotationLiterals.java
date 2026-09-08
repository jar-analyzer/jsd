@interface A {
  String value();
}

@A("a\nb")
public class StringAnnotationLiterals {

  public static void main(String[] a) {}
}
