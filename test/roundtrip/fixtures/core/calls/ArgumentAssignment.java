public class ArgumentAssignment {

  static int state = 1;

  static void pair(int a, int b) {
    System.out.println(a + ":" + b);
  }

  public static void main(String[] args) {
    int x = 1;
    pair(x, (x = 2));
    pair(state, (state = 3));
  }
}
