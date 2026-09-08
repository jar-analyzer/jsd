public class RegressionPlanArrayReceiverSaved {

  public static void main(String[] args) {
    int[] first = { 1 },
      second = { 9 };
    int[] a = first;
    a[0] = (a = second)[0];
    System.out.println(first[0] + ":" + second[0]);
  }
}
