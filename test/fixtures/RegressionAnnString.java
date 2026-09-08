@interface A {
  String value();
}

@A("a\nb")
public class RegressionAnnString {

  public static void main(String[] a) {}
}
