import java.lang.annotation.*;

@Retention(RetentionPolicy.CLASS)
@interface A {}

public class FieldAnnotations {

  @A
  public int x;

  public static void main(String[] a) {}
}
