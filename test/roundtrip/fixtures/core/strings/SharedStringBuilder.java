public class SharedStringBuilder {

  public static void main(String[] args) {
    StringBuilder a;
    StringBuilder b = (a = new StringBuilder()).append("x");
    System.out.println((a == b) + ":" + a + ":" + b);
  }
}
