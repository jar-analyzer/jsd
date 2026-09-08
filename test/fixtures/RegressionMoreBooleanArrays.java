public class RegressionMoreBooleanArrays {

  static boolean[] flags() {
    return new boolean[] { false, true };
  }

  static boolean echo(boolean value) {
    return value;
  }

  public static void main(String[] args) {
    boolean[][] rows = { flags(), flags() };
    for (boolean[] row : rows) {
      for (boolean value : row) {
        System.out.println(echo(value) + ":" + !value);
      }
    }
    System.out.println(echo(flags()[1]));
    System.out.println(rows[0][0] == rows[1][1]);
  }
}
