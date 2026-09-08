import java.util.ArrayList;
import java.util.List;

public class Objects {

  public static void main(String[] args) {
    Shape[] shapes = { new Circle(2), new Square(3), new Circle(1) };
    double total = 0;
    for (Shape s : shapes) total += s.area();
    System.out.println(total);

    List<String> names = new ArrayList<>();
    names.add("charlie");
    names.add("alice");
    names.add("bob");
    System.out.println(names);

    Box<Integer> bi = new Box<>(42);
    Box<String> bs = new Box<>("str");
    System.out.println(bi.get() + " " + bs.get());
    System.out.println(bi.sameAs(new Box<>(43)));

    Counter c = new Counter();
    c.inc();
    c.inc();
    c.inc(5);
    System.out.println(c.value());

    System.out.println(Utils.join(new String[] { "a", "b", "c" }, "-"));
    System.out.println(Utils.join(new String[] { "x" }, "-"));
    System.out.println(Utils.<String>identity("echo"));
  }
}

interface Shape {
  double area();

  default String describe() {
    return "shape with area " + area();
  }
}

class Circle implements Shape {

  final double r;

  Circle(double r) {
    this.r = r;
  }

  @Override
  public double area() {
    return Math.PI * r * r;
  }
}

class Square implements Shape {

  final double side;

  Square(double side) {
    this.side = side;
  }

  @Override
  public double area() {
    return side * side;
  }
}

class Box<T> {

  private final T value;

  Box(T value) {
    this.value = value;
  }

  T get() {
    return value;
  }

  <U> boolean sameAs(Box<U> other) {
    return String.valueOf(value).equals(String.valueOf(other.value));
  }
}

class Counter {

  private int n;

  void inc() {
    n++;
  }

  void inc(int by) {
    n += by;
  }

  int value() {
    return n;
  }
}

class Utils {

  static String join(String[] parts, String sep) {
    if (parts.length == 0) return "";
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < parts.length; i++) {
      if (i > 0) sb.append(sep);
      sb.append(parts[i]);
    }
    return sb.toString();
  }

  static <T> T identity(T t) {
    return t;
  }
}
