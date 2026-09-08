import java.util.List;

public class ModernJdk10 {

  public static void main(String[] args) {
    var list = List.of("x", "yy", "zzz");
    var total = 0;
    for (var s : list) total += s.length();
    var map = new java.util.HashMap<String, Integer>();
    map.put("k", total);
    System.out.println(total + " " + map.get("k"));
  }
}
