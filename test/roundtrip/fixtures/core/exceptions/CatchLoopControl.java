public class CatchLoopControl {

  static void run(boolean fail) {
    try {
      if (fail) throw new IllegalArgumentException();
      System.out.println("normal");
    } catch (IllegalArgumentException ex) {
      int sum = 0;
      for (int i = 0; i < 6; i++) {
        if (i == 1) continue;
        if (i == 4) break;
        sum += i;
      }
      System.out.println("caught:" + sum);
    }
    System.out.println("after");
  }

  public static void main(String[] args) {
    run(false);
    run(true);
  }
}
