public class RegressionEdgeNarrowingStores {

  static byte stepByte(byte value) {
    value += 130;
    return value;
  }

  static short stepShort(short value) {
    value *= 300;
    return value;
  }

  static char stepChar(char value) {
    value -= 2;
    return value;
  }

  public static void main(String[] args) {
    for (int n : new int[] { -1, 0, 1, 127, 255, 32767, 65535 }) {
      System.out.println(
        stepByte((byte) n) + ":" + stepShort((short) n) + ":" + (int) stepChar((char) n)
      );
    }
  }
}
