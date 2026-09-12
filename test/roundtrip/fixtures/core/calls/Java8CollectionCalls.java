import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

public class Java8CollectionCalls {

  public static void main(String[] args) {
    List<String> commands = new ArrayList<String>();
    commands.add(Paths.get("tool").toAbsolutePath().getFileName().toString());
    System.out.println(commands);
    Map<String, String> values = new HashMap<String, String>();
    values.putIfAbsent("key", "first");
    System.out.println(values.getOrDefault("missing", "default"));
    System.out.println(values.replace("key", "first", "second"));
    System.out.println(values.replace("key", "third"));
    System.out.println(values.remove("key", "third"));
    ConcurrentMap<String, Integer> concurrent = new ConcurrentHashMap<String, Integer>();
    concurrent.putIfAbsent("number", Integer.valueOf(1));
    System.out.println(concurrent.replace("number", Integer.valueOf(1), Integer.valueOf(2)));
    System.out.println(concurrent.remove("number", Integer.valueOf(2)));
  }
}
