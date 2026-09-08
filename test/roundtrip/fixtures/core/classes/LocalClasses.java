import java.util.ArrayList;
import java.util.List;

public class LocalClasses {

  public static void main(String[] args) {
    LocalClasses l = new LocalClasses();
    System.out.println(l.distances(3, 4));
    System.out.println(l.tally(new int[] { 1, 2, 2, 3, 1 }));
    System.out.println(l.makeAdder(10).apply(5));
    System.out.println(l.describe("hello"));
  }

  int distances(int dx, int dy) {
    class Point {

      final int x;
      final int y;

      Point(int x, int y) {
        this.x = x;
        this.y = y;
      }

      int len() {
        return x * x + y * y;
      }
    }
    List<Point> pts = new ArrayList<>();
    pts.add(new Point(dx, dy));
    pts.add(new Point(dy, dx));
    int total = 0;
    for (Point p : pts) {
      total += p.len();
    }
    return total;
  }

  String tally(int[] values) {
    class Counter {

      int[] counts = new int[4];

      void add(int v) {
        if (v >= 0 && v < counts.length) counts[v]++;
      }
    }
    Counter c = new Counter();
    for (int v : values) {
      c.add(v);
    }
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < c.counts.length; i++) {
      sb.append(i).append('x').append(c.counts[i]).append(' ');
    }
    return sb.toString().trim();
  }

  interface Adder {
    int apply(int v);
  }

  Adder makeAdder(int base) {
    return new Adder() {
      @Override
      public int apply(int v) {
        return base + v;
      }
    };
  }

  String describe(String s) {
    java.util.function.IntSupplier len = s::length;
    return s + ":" + len.getAsInt();
  }
}
