public class BuilderOverloads {

  public static void main(String[] args) {
    char[] chars = { 'a', 'b', 'c', 'd' };
    System.out.println(new StringBuilder().append(chars).toString());
    System.out.println(new StringBuilder().append("prefix:").append(chars, 1, 2).toString());
    System.out.println(new StringBuffer().append((CharSequence) "abcd", 1, 3).toString());
    try {
      System.out.println(new StringBuilder().append((char[]) null).toString());
    } catch (NullPointerException ex) {
      System.out.println("null-array");
    }
    try {
      System.out.println(new StringBuilder().append(chars, -1, 2).toString());
    } catch (IndexOutOfBoundsException ex) {
      System.out.println("bad-slice");
    }
  }
}
