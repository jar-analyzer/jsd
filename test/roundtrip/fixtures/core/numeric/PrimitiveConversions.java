public class PrimitiveConversions {

  static int unsigned(byte value) {
    char result = (char) value;
    return result;
  }

  static int signed(char value) {
    short result = (short) value;
    return result;
  }

  static int chained(byte value) {
    char result = (char) (short) value;
    return result;
  }

  public static void main(String[] args) {
    for (int value : new int[] { -128, -1, 0, 127, 32768, 65535 }) {
      System.out.println(
        unsigned((byte) value) + ":" + signed((char) value) + ":" + chained((byte) value)
      );
    }
  }
}
