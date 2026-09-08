public class LocalReadIncrement {

  static void show(int a, int b) {
    System.out.println(a + ":" + b);
  }

  public static void main(String[] args) {
    int i = 1;
    show(i, ++i);
    i = 1;
    System.out.println(i + (i = 7));
  }
}
