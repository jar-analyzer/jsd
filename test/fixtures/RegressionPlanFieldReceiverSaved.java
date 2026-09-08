public class RegressionPlanFieldReceiverSaved {

  int value;

  public static void main(String[] args) {
    RegressionPlanFieldReceiverSaved first = new RegressionPlanFieldReceiverSaved(),
      second = new RegressionPlanFieldReceiverSaved();
    RegressionPlanFieldReceiverSaved a = first;
    a.value = (a = second).value = 7;
    System.out.println(first.value + ":" + second.value);
  }
}
