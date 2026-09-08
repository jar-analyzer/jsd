import java.util.ArrayList;
import java.util.List;

public class Generics {

  public static void main(String[] args) {
    Generics g = new Generics();
    System.out.println(g.first(new Integer[] { 3, 1, 2 }));
    System.out.println(g.first(new String[] { "x", "y" }));

    Box<Integer> bi = new Box<>(7);
    Box<String> bs = new Box<>("s");
    System.out.println(bi.value() + 1);
    System.out.println(bs.value() + "!");

    List<Number> nums = new ArrayList<>();
    g.addAll(nums, 1, 2.5, 3L);
    System.out.println(nums);

    List<Integer> ints = new ArrayList<>();
    g.copyFrom(ints, new ArrayList<Integer>(java.util.Arrays.asList(9, 8)));
    System.out.println(ints);

    System.out.println(g.compare(5, 6));
    System.out.println(g.compare(3.5, 3.0));
  }

  <T> T first(T[] arr) {
    return arr.length > 0 ? arr[0] : null;
  }

  <T extends Number> void addAll(List<? super T> target, T... values) {
    for (T v : values) target.add(v);
  }

  void copyFrom(List<? super Integer> target, List<? extends Integer> source) {
    for (Integer v : source) target.add(v);
  }

  <T extends Comparable<T>> int compare(T a, T b) {
    return a.compareTo(b) >= 0 ? 1 : -1;
  }

  static class Box<T> {

    private final T v;

    Box(T v) {
      this.v = v;
    }

    T value() {
      return v;
    }
  }
}
