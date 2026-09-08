public class RegressionMoreBoxedIdentity {

  static String compare(Integer left, Integer right) {
    return (left == right) + ":" + (left == right.intValue()) + ":" + left.equals(right);
  }

  public static void main(String[] args) {
    Integer first = new Integer(1000);
    Integer second = new Integer(1000);
    System.out.println(compare(first, first));
    System.out.println(compare(first, second));
    Boolean flag = Boolean.FALSE;
    System.out.println(!flag + ":" + (flag == Boolean.FALSE));
    try {
      compare(null, first);
    } catch (NullPointerException ex) {
      System.out.println("null-unbox");
    }
  }
}
