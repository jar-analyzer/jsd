public class RegressionEdgeWideArrayValues {

  static int calls;

  static int index() {
    calls++;
    return 0;
  }

  public static void main(String[] args) {
    long[] values = { Long.MAX_VALUE };
    System.out.println(values[index()]++);
    System.out.println(++values[index()]);
    System.out.println(values[0] + ":" + calls);
    double[] doubles = { -0.0 };
    System.out.println(doubles[index()]++);
    System.out.println(++doubles[index()]);
    System.out.println(doubles[0] + ":" + calls);
  }
}
