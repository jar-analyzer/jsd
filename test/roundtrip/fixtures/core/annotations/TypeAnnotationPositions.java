import java.lang.annotation.*;
import java.util.*;

public class TypeAnnotationPositions<T> {

  @BothMark
  public String value;

  public List<@PositionMark("first") @InvisibleMark String> values;
  public @PositionMark("repeated1") @PositionMark("repeated2") String repeated;

  @PositionMark("constructor")
  public <U> TypeAnnotationPositions(U input) {}

  public @BothMark String method(@BothMark String input) {
    return input;
  }

  public void arrays(String @PositionMark("array") [] @PositionMark("varargs")... values) {}

  class Member<U> {

    Member(
      @PositionMark("outerReceiver") TypeAnnotationPositions<T> TypeAnnotationPositions.this
    ) {}

    void method(TypeAnnotationPositions<T>.@PositionMark("receiver") Member<U> this) {}
  }

  static Runnable anonymous() {
    return new @PositionMark("anonymousSuper") Runnable() {
      public @PositionMark("anonymousField") String value;

      public @PositionMark("anonymousReturn") String value(
        @PositionMark("anonymousParameter") String input
      ) {
        return input;
      }

      public void run() {}
    };
  }

  static String local(String input) {
    @PositionMark("local")
    @InvisibleMark
    String value = input;
    return value;
  }

  public static void main(String[] args) throws Exception {
    System.out.println(local("value"));
    System.out.println(anonymous().getClass().getAnnotatedInterfaces()[0].getAnnotations().length);
    System.out.println(TypeAnnotationPositions.class.getField("value").getAnnotations().length);
    System.out.println(
      TypeAnnotationPositions.class.getField("value").getAnnotatedType().getAnnotations().length
    );
  }
}

@Retention(RetentionPolicy.RUNTIME)
@Target({ ElementType.TYPE_USE, ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER })
@interface BothMark {}

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE_USE)
@Repeatable(PositionMarks.class)
@interface PositionMark {
  String value();
}

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE_USE)
@interface PositionMarks {
  PositionMark[] value();
}

@Retention(RetentionPolicy.CLASS)
@Target(ElementType.TYPE_USE)
@interface InvisibleMark {}
