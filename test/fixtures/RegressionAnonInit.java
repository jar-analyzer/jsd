public class RegressionAnonInit {

  static int calls;

  public static void main(String[] args) {
    Runnable r = new Runnable() {
      int x = 7;

      {
        calls++;
      }

      public void run() {
        System.out.print(x + ":" + calls);
      }
    };
    r.run();
  }
}
