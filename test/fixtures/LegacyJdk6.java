import java.util.ArrayList;
import java.util.List;

public class LegacyJdk6 {

  enum Color {
    RED,
    GREEN,
    BLUE,
  }

  static class Pair<A, B> {

    A first;
    B second;

    Pair(A a, B b) {
      first = a;
      second = b;
    }
  }

  static int sumAll(int... xs) {
    int t = 0;
    for (int x : xs) {
      t += x;
    }
    return t;
  }

  public static void main(String[] args) {
    List<Integer> xs = new ArrayList<Integer>();
    for (Integer x : new Integer[] { 3, 1, 2 }) {
      xs.add(x * 2);
    }
    int total = 0;
    for (int v : xs) {
      total += v;
    }
    Pair<String, Integer> p = new Pair<String, Integer>("n", total);
    System.out.println(p.first + "=" + p.second + " " + Color.values().length);
    System.out.println(sumAll(1, 2, 3));
    assert total == 12 : "bad";
  }
}
