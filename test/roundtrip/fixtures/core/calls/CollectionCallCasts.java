import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;

public class CollectionCallCasts {

  static Map<Character, int[]> map;
  static HashMap<Character, int[]> concrete;

  public static void main(String[] args) {
    List<String> commands = new ArrayList<String>();
    commands.add("first");
    commands.add("-jar");
    commands.add(1, "middle");
    commands.set(0, "changed");
    System.out.println(commands + ":" + commands.contains("-jar"));
    map = new HashMap<Character, int[]>();
    map.put(Character.valueOf('.'), new int[] { 192, 174 });
    concrete = new HashMap<Character, int[]>();
    concrete.put(Character.valueOf(';'), new int[] { 192, 187 });
    System.out.println(map.get(Character.valueOf('.'))[1]);
    System.out.println(concrete.get(Character.valueOf(';'))[1]);
    Map<String, String> values = new HashMap<String, String>();
    values.put("key", "value");
    System.out.println(values.containsKey("key") + ":" + values.containsValue("value"));
    System.out.println(pick(values.put("key", "next")));
    System.out.println(pick(values.get("key")));
    System.out.println(pick((Object) values.get("key")));
    System.out.println(values.remove("key"));
    Collection<String> collection = new ArrayList<String>();
    collection.add("element");
    System.out.println(collection.remove("element"));
    Set<String> set = new HashSet<String>();
    set.add("unique");
    System.out.println(set.contains("unique"));
    Queue<String> queue = new LinkedList<String>();
    queue.offer("queued");
    System.out.println(queue.remove());
    Deque<String> deque = new LinkedList<String>();
    deque.addFirst("head");
    deque.addLast("tail");
    System.out.println(deque.removeFirstOccurrence("tail") + ":" + deque.removeFirst());
  }

  static String pick(Object value) {
    return "object:" + value;
  }

  static String pick(String value) {
    return "string:" + value;
  }
}
