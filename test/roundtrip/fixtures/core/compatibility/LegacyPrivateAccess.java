public class LegacyPrivateAccess {

  private int value = 4;
  private static long total = 9L;
  private String label = "a";

  private int add(int x) {
    value += x;
    return value;
  }

  static class Reader {

    static void run(LegacyPrivateAccess target) {
      System.out.println(target.value);
      System.out.println((target.value = 7));
      System.out.println(target.value++);
      System.out.println(++target.value);
      System.out.println((target.value += 5));
      System.out.println(target.add(3));
      System.out.println(total);
      System.out.println((total = 12L));
      System.out.println(total++);
      System.out.println(++total);
      System.out.println((total *= 3L));
      System.out.println((target.label = "b"));
      System.out.println((target.label += target.value));
    }
  }

  class Inner {

    private int number = 2;
    private byte small = 127;
    private char letter = 65535;
    private long large = Long.MAX_VALUE;
    private double fraction = -0.0;
    private String text = "inner";

    private int add(int x) {
      return (number += x);
    }

    private long mix(long a, double b, int c) {
      return a + (long) b + c + number;
    }
  }

  static int sideEffect() {
    total += 100L;
    return 3;
  }

  public static void main(String[] args) {
    LegacyPrivateAccess target = new LegacyPrivateAccess();
    Reader.run(target);
    Inner inner = target.new Inner();
    System.out.println(inner.number++);
    System.out.println(inner.add(4));
    System.out.println(inner.number);
    System.out.println((inner.number = 12));
    System.out.println(--inner.number);
    System.out.println(inner.number--);
    System.out.println(inner.small++);
    System.out.println(++inner.small);
    System.out.println((int) inner.letter++);
    System.out.println((int) --inner.letter);
    System.out.println(inner.large++);
    System.out.println(--inner.large);
    System.out.println((inner.large = 8L));
    System.out.println(inner.fraction--);
    System.out.println(++inner.fraction);
    System.out.println((inner.text = "changed"));
    System.out.println(inner.text);
    System.out.println(inner.mix(3L, 4.0, 5));
    try {
      inner = null;
      inner.number = sideEffect();
    } catch (NullPointerException ex) {
      System.out.println("null:" + total);
    }
    System.out.println(target.value + ":" + total + ":" + target.label);
  }
}
