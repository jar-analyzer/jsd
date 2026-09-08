public class RegressionTempEvaluation {

  static int state;

  static int read() {
    return state++;
  }

  static int branch(boolean choose) {
    int r1;
    if (choose) r1 = read();
    else r1 = read() + 1;
    state += 10;
    return r1;
  }

  static int checked() {
    int r2 = 100 / state;
    state = 5;
    return r2;
  }

  public static void main(String[] args) {
    state = 0;
    System.out.println(branch(true) + ":" + state);
    state = 0;
    System.out.println(branch(false) + ":" + state);
    state = 0;
    try {
      checked();
    } catch (ArithmeticException error) {
      System.out.println(state);
    }
  }
}
