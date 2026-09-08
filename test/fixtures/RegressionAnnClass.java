@interface A {
  Class<?> value();
}

@A(String.class)
public class RegressionAnnClass {

  public static void main(String[] a) {}
}
