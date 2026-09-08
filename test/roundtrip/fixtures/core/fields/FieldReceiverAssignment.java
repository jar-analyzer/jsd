public class FieldReceiverAssignment {

  int value;

  public static void main(String[] args) {
    FieldReceiverAssignment first = new FieldReceiverAssignment(),
      second = new FieldReceiverAssignment();
    FieldReceiverAssignment a = first;
    a.value = (a = second).value = 7;
    System.out.println(first.value + ":" + second.value);
  }
}
