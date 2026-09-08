import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class CollectionOps {

  public static void main(String[] args) {
    System.out.println(CollectionOps.listOps());
    System.out.println(CollectionOps.mapOps());
    System.out.println(CollectionOps.setOps());
    System.out.println(CollectionOps.queueOps());
    System.out.println(CollectionOps.sortAndJoin());
  }

  static String listOps() {
    List<Integer> xs = new ArrayList<>();
    for (int i = 0; i < 5; i++) xs.add(i * i);
    xs.add(1, 99);
    xs.remove(0);
    int sum = 0;
    for (int v : xs) sum += v;
    return xs + " sum=" + sum + " size=" + xs.size();
  }

  static String mapOps() {
    Map<String, Integer> m = new HashMap<>();
    m.put("a", 1);
    m.put("b", 2);
    m.put("a", m.get("a") + 10);
    int total = 0;
    for (Map.Entry<String, Integer> e : m.entrySet()) {
      total += e.getValue();
    }
    return m.get("a") + "/" + m.get("b") + "/" + total + "/" + m.containsKey("z");
  }

  static String setOps() {
    Set<String> seen = new HashSet<>();
    seen.add("x");
    seen.add("y");
    seen.add("x");
    return seen.size() + ":" + seen.contains("y") + ":" + seen;
  }

  static String queueOps() {
    LinkedList<String> q = new LinkedList<>();
    q.add("head");
    q.add("tail");
    q.removeFirst();
    q.addFirst("new-head");
    StringBuilder sb = new StringBuilder();
    Iterator<String> it = q.iterator();
    while (it.hasNext()) sb.append(it.next()).append('>');
    return sb + " peek=" + q.peek();
  }

  static String sortAndJoin() {
    List<String> words = new ArrayList<>(Arrays.asList("pear", "fig", "banana", "apple"));
    java.util.Collections.sort(words);
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < words.size(); i++) {
      if (i > 0) sb.append(',');
      sb.append(words.get(i));
    }
    return sb.toString();
  }
}
