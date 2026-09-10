import java.lang.annotation.*;
import java.util.*;

public record RecordTypeAnnotations(
  @RecordMark("component") String name,
  List<@RecordMark("argument") String> values,
  String @RecordMark("array") [] items
) {
  public static void main(String[] args) throws Exception {
    RecordTypeAnnotations value = new RecordTypeAnnotations("value", List.of("item"), new String[] {
      "array",
    });
    System.out.println(value.name());
    System.out.println(value.values().get(0));
    System.out.println(value.items()[0]);
    System.out.println(
      Arrays.toString(
        RecordTypeAnnotations.class.getRecordComponents()[0].getAnnotatedType().getAnnotations()
      )
    );
    System.out.println(
      Arrays.toString(
        RecordTypeAnnotations.class.getMethod("name").getAnnotatedReturnType().getAnnotations()
      )
    );
  }
}

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE_USE)
@interface RecordMark {
  String value();
}
