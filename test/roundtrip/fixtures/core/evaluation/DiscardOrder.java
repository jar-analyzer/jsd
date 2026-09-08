public class DiscardOrder {

  static int sequence;

  static int first() {
    sequence = sequence * 10 + 1;
    return sequence;
  }

  static DiscardOrder receiver() {
    sequence = sequence * 10 + 2;
    return null;
  }

  static DiscardOrder receiver(int ignored) {
    return receiver();
  }

  static int value() {
    sequence = sequence * 10 + 3;
    return sequence;
  }

  static void consume(int left, int right) {
    System.out.println(left + ":" + right + ":" + sequence);
  }

  public static void main(String[] args) {
    consume(first(), receiver().value());
    sequence = 0;
    int local = 7;
    consume(local, receiver(local++).value());
    System.out.println(local);
  }
}
