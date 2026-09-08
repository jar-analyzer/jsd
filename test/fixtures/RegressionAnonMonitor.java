public class RegressionAnonMonitor {

  public static void main(String[] args) {
    Runnable r = new Runnable() {
      public synchronized void run() {
        System.out.print(Thread.holdsLock(this));
      }
    };
    r.run();
  }
}
