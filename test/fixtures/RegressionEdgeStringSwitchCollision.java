public class RegressionEdgeStringSwitchCollision {

  static int select(String value) {
    switch (value) {
      case "Aa":
        return 1;
      case "BB":
        return 2;
      case "AaAa":
        return 3;
      case "BBBB":
        return 4;
      case "":
        return 5;
      default:
        return -1;
    }
  }

  public static void main(String[] args) {
    for (String value : new String[] { "Aa", "BB", "AaAa", "BBBB", "", "AaBB", "other" })
      System.out.println(select(value));
    try {
      System.out.println(select(null));
    } catch (NullPointerException ex) {
      System.out.println("null");
    }
  }
}
