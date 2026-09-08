import java.io.*;
import java.util.function.Function;
import java.util.function.IntUnaryOperator;

public class SerializableLambdas {

  static Function<String, String> reference() {
    return (Function<String, String> & Serializable) String::trim;
  }

  static Function<String, String> captured(String prefix) {
    return (Function<String, String> & Serializable & Cloneable) value -> prefix + value;
  }

  static IntUnaryOperator primitive(int offset) {
    return (IntUnaryOperator & Serializable) value -> value + offset;
  }

  static Object copy(Object value) throws Exception {
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    ObjectOutputStream output = new ObjectOutputStream(buffer);
    output.writeObject(value);
    output.close();
    ObjectInputStream input = new ObjectInputStream(new ByteArrayInputStream(buffer.toByteArray()));
    Object result = input.readObject();
    input.close();
    return result;
  }

  public static void main(String[] args) throws Exception {
    Function<String, String> ref = reference();
    System.out.println(ref.apply(" hello "));
    System.out.println(((Function<String, String>) copy(ref)).apply(" world "));
    Function<String, String> cap = captured("prefix:");
    System.out.println(cap instanceof Serializable);
    System.out.println(cap instanceof Cloneable);
    System.out.println(((Function<String, String>) copy(cap)).apply("value"));
    System.out.println(((IntUnaryOperator) copy(primitive(7))).applyAsInt(5));
  }
}
