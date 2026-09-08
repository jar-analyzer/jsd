public class CatchBackEdgeLoop {

  public static void main(String[] args) {
    for (int i = 0; i < 3; i++) try {
      throw new IllegalStateException();
    } catch (IllegalStateException e) {
      System.out.println(i);
    }
  }
}
