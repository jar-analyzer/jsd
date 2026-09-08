public class RegressionComparableImpl implements Comparable<RegressionComparableImpl> {

  public int compareTo(RegressionComparableImpl other) {
    return 0;
  }

  public static void main(String[] args) {
    System.out.print(new RegressionComparableImpl().compareTo(new RegressionComparableImpl()));
  }
}
