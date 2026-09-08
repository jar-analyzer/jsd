import java.util.Iterator;
import java.util.NoSuchElementException;

public class InnerClasses {

  private final String tag = "outer";

  public static void main(String[] args) {
    InnerClasses outer = new InnerClasses();
    InnerClasses.Node n = outer.new Node();
    n.add("a");
    n.add("b");
    for (String s : n) System.out.println(s);

    Counter c = new Counter();
    c.bump();
    System.out.println(c.count());

    Greeter g = new Greeter() {
      @Override
      public String greet(String who) {
        return "Hello, " + who + "!";
      }
    };
    System.out.println(g.greet("world"));

    int base = 100;
    class LocalAdder implements Adder {

      @Override
      public int add(int x) {
        return base + x;
      }
    }
    Adder adder = new LocalAdder();
    System.out.println(adder.add(23));

    StaticNested sn = new StaticNested(5);
    System.out.println(sn.doubled());

    System.out.println(outer.describe());
  }

  String describe() {
    Node innerNode = new Node();
    innerNode.add(tag);
    StringBuilder sb = new StringBuilder();
    for (String s : innerNode) sb.append('[').append(s).append(']');
    return sb.toString();
  }

  class Node implements Iterable<String> {

    private String[] items = new String[4];
    private int size;

    void add(String item) {
      if (size == items.length) {
        String[] bigger = new String[items.length * 2];
        System.arraycopy(items, 0, bigger, 0, size);
        items = bigger;
      }
      items[size++] = item;
    }

    String tag() {
      return tag;
    }

    @Override
    public Iterator<String> iterator() {
      return new Iterator<String>() {
        private int pos;

        @Override
        public boolean hasNext() {
          return pos < size;
        }

        @Override
        public String next() {
          if (!hasNext()) throw new NoSuchElementException();
          return items[pos++];
        }
      };
    }
  }

  interface Adder {
    int add(int x);
  }

  interface Greeter {
    String greet(String who);
  }

  static class Counter {

    private int n;

    void bump() {
      n++;
      Runnable r = new Runnable() {
        @Override
        public void run() {
          System.out.println("counting " + n);
        }
      };
      r.run();
    }

    int count() {
      return n;
    }
  }

  static class StaticNested {

    final int v;

    StaticNested(int v) {
      this.v = v;
    }

    int doubled() {
      return v * 2;
    }
  }
}
