import java.util.AbstractMap;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

public class GenericErasedResults {

  static class Box<T> {

    T value;

    Box(T value) {
      this.value = value;
    }

    T get() {
      return value;
    }
  }

  static <T> T identity(T value) {
    return value;
  }

  static <T> T delegate(T value) {
    return identity(value);
  }

  static <T> T create() {
    return (T) "made";
  }

  static <T> T[] arrayIdentity(T[] value) {
    return value;
  }

  static <T> T[] arrayDelegate(T[] value) {
    return arrayIdentity(value);
  }

  static String pickArray(Object[] value) {
    return "objects";
  }

  static String pickArray(String[] value) {
    return "strings";
  }

  static String pick(Object value) {
    return "object:" + value;
  }

  static String pick(String value) {
    return "string:" + value;
  }

  public static void main(String[] args) {
    List<String> values = new ArrayList<String>();
    values.add("value");
    Iterator<String> iterator = values.iterator();
    System.out.println(pick((Object) iterator.next()));
    Map.Entry<String, String> entry = new AbstractMap.SimpleEntry<String, String>("key", "entry");
    System.out.println(pick((Object) entry.getValue()));
    Box<String> box = new Box<String>("box");
    System.out.println(pick((Object) box.get()));
    System.out.println(pick((Object) identity("identity")));
    System.out.println(pick(box.get()));
    System.out.println(pick(identity("typed")));
    System.out.println(pick(delegate("delegate")));
    System.out.println(pick((Object) create()));
    String created = create();
    System.out.println(created);
    System.out.println(pickArray((Object[]) arrayIdentity(new String[] { "array" })));
    System.out.println(pickArray(arrayDelegate(new String[] { "array" })));
    ((List) values).set(0, Integer.valueOf(7));
    Iterator<String> polluted = values.iterator();
    System.out.println(pick((Object) polluted.next()));
  }
}
