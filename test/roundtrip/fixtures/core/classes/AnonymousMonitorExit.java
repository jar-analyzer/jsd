public class AnonymousMonitorExit {

  public static void main(String[] args) {
    Runnable locked = new Runnable() {
      public synchronized void run() {
        System.out.println(Thread.holdsLock(this));
        throw new IllegalStateException("exit");
      }
    };
    try {
      locked.run();
    } catch (IllegalStateException error) {
      System.out.println(Thread.holdsLock(locked));
    }
    Runnable unlocked = new Runnable() {
      public void run() {
        System.out.println(Thread.holdsLock(this));
      }
    };
    unlocked.run();
  }
}
