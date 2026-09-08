public class LoopTail {

  public static void main(String[] args) {
    int visits = 0;
    for (int i = 0; i < 4; i++) {
      visits++;
      System.out.println((i == 1) + ":" + visits);
    }
    System.out.println("visits:" + visits);
  }
}
