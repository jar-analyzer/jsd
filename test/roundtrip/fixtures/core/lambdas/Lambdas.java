import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.function.BiFunction;
import java.util.function.Function;
import java.util.function.Supplier;

public class Lambdas {

  private final int base = 100;

  public static void main(String[] args) {
    Lambdas l = new Lambdas();
    l.runAll();
    System.out.println(l.transform(5, x -> x * 2));
    System.out.println(l.transform(5, Lambdas::square));
    System.out.println(l.transform("7", Integer::parseInt));
    System.out.println(l.combine(3, 4, (a, b) -> a + b));
    System.out.println(l.combine(3, 4, Integer::sum));
    Supplier<String> greeting = () -> "hi";
    System.out.println(greeting.get());
    System.out.println(l.capture(10));
    l.sortDemo();
    Runnable r = () -> System.out.println("runnable ran");
    r.run();
    Thread t = new Thread(() -> System.out.println("thread ran"));
    t.start();
    try {
      t.join();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
    System.out.println(l.multi(3));
    System.out.println(l.multi(8));
  }

  void runAll() {
    List<Runnable> runs = new ArrayList<>();
    for (int i = 0; i < 3; i++) {
      final int idx = i;
      runs.add(() -> System.out.println("task " + idx));
    }
    for (Runnable run : runs) run.run();
  }

  int transform(int x, Function<Integer, Integer> f) {
    return f.apply(x);
  }

  int transform(String s, Function<String, Integer> f) {
    return f.apply(s) + 1;
  }

  static int square(int x) {
    return x * x;
  }

  int combine(int a, int b, BiFunction<Integer, Integer, Integer> f) {
    return f.apply(a, b) + base;
  }

  int capture(int delta) {
    int local = 7;
    Supplier<Integer> sup = () -> base + local + delta;
    return sup.get();
  }

  void sortDemo() {
    List<String> words = new ArrayList<>(Arrays.asList("pear", "fig", "banana", "apple"));
    words.sort(Comparator.comparingInt(String::length));
    System.out.println(words);
    words.sort(Comparator.reverseOrder());
    System.out.println(words);
    words.removeIf(w -> w.startsWith("f"));
    System.out.println(words);
  }

  int multi(int n) {
    List<Integer> list = new ArrayList<>();
    for (int i = 1; i <= n; i++) list.add(i);
    int evens = 0,
      sum = 0;
    for (int v : list) {
      if (v % 2 == 0) evens++;
      sum += v;
    }
    return evens * 1000 + sum;
  }
}
