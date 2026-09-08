public class SharedStringBuffer {

  public static void main(String[] args) {
    StringBuffer a;
    StringBuffer b = (a = new StringBuffer()).append("x");
    System.out.println((a == b) + ":" + a + ":" + b);
  }
}
