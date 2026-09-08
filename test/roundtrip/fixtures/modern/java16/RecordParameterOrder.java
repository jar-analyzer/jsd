record RS(int x, int y) {
  RS(int x, int y) {
    this.x = y;
    this.y = x;
  }
}

public class RecordParameterOrder {

  public static void main(String[] args) {
    RS a = new RS(2, 7);
    System.out.println(a.x() + ":" + a.y());
  }
}
