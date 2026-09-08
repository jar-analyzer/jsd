public class BooleanStores {

  boolean flag;
  boolean[] arr = new boolean[2];

  public static void main(String[] args) {
    BooleanStores p = new BooleanStores();
    int x = 3;
    System.out.println("lit=" + (x > 0));
    p.flag = x > 0;
    p.arr[0] = x > 1;
    Holder h = new Holder(x > 2);
    boolean b = x > 0;
    if (b) System.out.println("ok " + h.v + " " + p.flag + " " + p.arr[0]);
  }
}

class Holder {

  final boolean v;

  Holder(boolean v) {
    this.v = v;
  }
}
