public class SynchronizedBranches {

  static final Object LOCK = new Object();
  static int counter = 0;

  public static void main(String[] args) {
    SynchronizedBranches s = new SynchronizedBranches();
    System.out.println(s.guarded(3));
    System.out.println(s.guarded(8));
    System.out.println(s.guarded(-1));
    System.out.println(syncStatic(10));
    System.out.println(counter);
  }

  int guarded(int v) {
    synchronized (LOCK) {
      counter++;
      if (v < 0) {
        return -1;
      }
      if (v % 2 == 0) {
        return v * 10;
      } else {
        return v + 100;
      }
    }
  }

  static synchronized int syncStatic(int v) {
    counter += v;
    return counter;
  }
}
