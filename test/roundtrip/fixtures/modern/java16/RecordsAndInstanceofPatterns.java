public class RecordsAndInstanceofPatterns {

  record Point(int x, int y) {}

  static int sum(Object o) {
    if (o instanceof Point p) return p.x() + p.y();
    if (o instanceof Integer i) return i;
    return -1;
  }

  public static void main(String[] args) {
    System.out.println(sum(new Point(2, 3)) + " " + sum(7) + " " + sum("x"));
  }
}
