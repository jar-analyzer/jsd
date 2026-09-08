import java.lang.annotation.*;

@Retention(RetentionPolicy.CLASS)
@interface A {}

public class RegressionFieldAnn {

  @A
  public int x;

  public static void main(String[] a) {}
}
