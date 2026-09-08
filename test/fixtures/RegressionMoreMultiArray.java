public class RegressionMoreMultiArray {

  static String trace = "";

  static int dimension(int value) {
    trace += value + ",";
    return value;
  }

  static void build(int first, int second) {
    trace = "";
    try {
      int[][] values = new int[dimension(first)][dimension(second)];
      System.out.println(trace + ":" + values.length);
    } catch (NegativeArraySizeException ex) {
      System.out.println(trace + ":negative");
    }
  }

  public static void main(String[] args) {
    build(2, 3);
    build(0, -1);
    build(-1, 2);
    String[][][] values = new String[2][3][];
    System.out.println(values.length + ":" + values[0].length + ":" + values[0][0]);
  }
}
