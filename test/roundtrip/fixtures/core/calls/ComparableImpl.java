public class ComparableImpl implements Comparable<ComparableImpl> {

  public int compareTo(ComparableImpl other) {
    return 0;
  }

  public static void main(String[] args) {
    System.out.print(new ComparableImpl().compareTo(new ComparableImpl()));
  }
}
