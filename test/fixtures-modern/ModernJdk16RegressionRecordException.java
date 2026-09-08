record RX(int x) {
  RX(int x) {
    this.x = 10 / x;
  }
}

public class ModernJdk16RegressionRecordException {

  public static void main(String[] args) {
    try {
      System.out.println(new RX(0).x());
    } catch (ArithmeticException e) {
      System.out.println("division");
    }
  }
}
