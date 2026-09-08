public class SynchronizedMethodsAndBlocks {

  static final Object LOCK = new Object();
  int counter = 0;

  static synchronized int staticSync(int v) {
    return v * 2;
  }

  synchronized int instanceSync(int v) {
    counter += v;
    return counter;
  }

  public static void main(String[] args) {
    SynchronizedMethodsAndBlocks s = new SynchronizedMethodsAndBlocks();
    System.out.println(staticSync(21));
    System.out.println(s.instanceSync(5));
    synchronized (LOCK) {
      synchronized (s) {
        s.counter += 100;
      }
    }
    System.out.println(s.instanceSync(0));
    Object local = new Object();
    synchronized (local) {
      System.out.println("local-lock");
    }
  }
}
