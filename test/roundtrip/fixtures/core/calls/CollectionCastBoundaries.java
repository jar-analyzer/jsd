import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class CollectionCastBoundaries {

  static List<String> polluted = new ArrayList<String>();

  public static void main(String[] args) {
    List<Integer> numbers = new ArrayList<Integer>();
    numbers.add(Integer.valueOf(7));
    numbers.add(Integer.valueOf(0));
    System.out.println(numbers.remove((Object) Integer.valueOf(0)));
    System.out.println(numbers.remove(0));
    List<String> strings = new ArrayList<String>();
    ((List) strings).add(Integer.valueOf(23));
    System.out.println(((List) strings).get(0));
    ((List) polluted).add(Integer.valueOf(29));
    System.out.println(((List) polluted).get(0));
    Map<String, String> values = new HashMap<String, String>();
    ((Map) values).put("key", Integer.valueOf(31));
    System.out.println(((Map) values).get("key"));
    List<? super String> sink = new ArrayList<Object>();
    sink.add("lower");
    List<?> unknown = sink;
    unknown.add(null);
    System.out.println(unknown);
    OverloadedList custom = new OverloadedList();
    ((List) custom).add("generic");
    custom.add("specific");
    System.out.println(custom);
    MissingCollection missing = new MissingCollection();
    missing.put((Object) "key", (Object) "value");
    System.out.println(missing.selected);
    try {
      ((List) wrong()).add("fail");
    } catch (ClassCastException expected) {
      System.out.println("cast");
    }
  }

  static Object wrong() {
    return "wrong";
  }
}

class OverloadedList extends ArrayList<String> {

  public boolean add(String value) {
    return super.add("override:" + value);
  }
}

class MissingCollection {

  String selected;

  Object put(Object key, Object value) {
    selected = "object";
    return null;
  }

  Object put(String key, String value) {
    selected = "string";
    return null;
  }
}
