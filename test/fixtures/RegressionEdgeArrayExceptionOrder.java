public class RegressionEdgeArrayExceptionOrder {

  static String trace;

  static int[] array(boolean nil) {
    trace += "A";
    return nil ? null : new int[] { 5 };
  }

  static int index(int value) {
    trace += "I";
    return value;
  }

  static int rhs() {
    trace += "R";
    return 3;
  }

  static void run(boolean nil, int at) {
    trace = "";
    try {
      array(nil)[index(at)] += rhs();
    } catch (NullPointerException ex) {
      trace += "N";
    } catch (ArrayIndexOutOfBoundsException ex) {
      trace += "B";
    }
    System.out.println(trace);
  }

  public static void main(String[] args) {
    run(false, 0);
    run(false, 1);
    run(true, 0);
    run(true, 1);
  }
}
