import java.lang.annotation.*;
import java.lang.reflect.*;
import java.util.*;

public class TypeAnnotations<
    @TypeMark("parameter") T extends @TypeMark("bound") Number
      & @TypeMark("interfaceBound") Comparable<T>
  >
  extends @TypeMark("super") Object
  implements @TypeMark("interface") Runnable
{

  public @TypeMark("field") String value;
  public List<@TypeMark("argument") String> values;
  public List<@TypeMark("wildcard") ? extends @TypeMark("wildcardBound") Number> upper;
  public List<? super @TypeMark("lowerBound") Integer> lower;
  public @TypeMark("element") String @TypeMark("outerArray") []@TypeMark("innerArray") [] matrix;
  public TypeOwner<@TypeMark("ownerArg") String>.@TypeMark("inner") Member<@TypeMark(
    "innerArg"
  ) Integer> nested;

  @TypeMark("constructor")
  public TypeAnnotations() {}

  public <@TypeMark("methodParameter") U extends @TypeMark("methodBound") Number> @TypeMark(
    "return"
  ) U convert(@TypeMark("receiver") TypeAnnotations<T> this, @TypeMark("argumentType") U input)
    throws @TypeMark("throws") IllegalArgumentException {
    return input;
  }

  public void varargs(String @TypeMark("varargs")... values) {}

  public void run() {}

  public static void main(String[] args) throws Exception {
    TypeAnnotationProbe.inspect(TypeAnnotations.class);
  }
}

class TypeOwner<T> {

  class Member<U> {}
}

@Retention(RetentionPolicy.RUNTIME)
@Target({ ElementType.TYPE_USE, ElementType.TYPE_PARAMETER })
@interface TypeMark {
  String value();
}

class TypeAnnotationProbe {

  static void type(AnnotatedType value) {
    System.out.println(
      value.getType().getTypeName() + ":" + Arrays.toString(value.getAnnotations())
    );
    if (value instanceof AnnotatedArrayType) type(
      ((AnnotatedArrayType) value).getAnnotatedGenericComponentType()
    );
    if (value instanceof AnnotatedParameterizedType) {
      for (AnnotatedType argument : (
        (AnnotatedParameterizedType) value
      ).getAnnotatedActualTypeArguments())
        type(argument);
    }
    if (value instanceof AnnotatedWildcardType) {
      for (AnnotatedType bound : ((AnnotatedWildcardType) value).getAnnotatedUpperBounds())
        type(bound);
      for (AnnotatedType bound : ((AnnotatedWildcardType) value).getAnnotatedLowerBounds())
        type(bound);
    }
  }

  static void parameters(TypeVariable<?>[] parameters) {
    for (TypeVariable<?> parameter : parameters) {
      System.out.println(parameter.getName() + ":" + Arrays.toString(parameter.getAnnotations()));
      for (AnnotatedType bound : parameter.getAnnotatedBounds()) type(bound);
    }
  }

  static void inspect(Class<?> cls) throws Exception {
    parameters(cls.getTypeParameters());
    type(cls.getAnnotatedSuperclass());
    for (AnnotatedType type : cls.getAnnotatedInterfaces()) type(type);
    for (String name : new String[] { "value", "values", "upper", "lower", "matrix", "nested" })
      type(cls.getField(name).getAnnotatedType());
    type(cls.getConstructor().getAnnotatedReturnType());
    Method method = cls.getMethod("convert", Number.class);
    parameters(method.getTypeParameters());
    type(method.getAnnotatedReturnType());
    type(method.getAnnotatedReceiverType());
    for (AnnotatedType type : method.getAnnotatedParameterTypes()) type(type);
    for (AnnotatedType type : method.getAnnotatedExceptionTypes()) type(type);
    type(cls.getMethod("varargs", String[].class).getAnnotatedParameterTypes()[0]);
  }
}
