record RA(int x) {
  RA(int x) {
    this.x = x + 1;
  }
}

public class RecordValueAdjustment {

  public static void main(String[] args) {
    System.out.println(new RA(7).x());
  }
}
