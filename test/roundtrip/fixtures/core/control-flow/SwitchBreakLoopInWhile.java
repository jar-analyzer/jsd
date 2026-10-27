public class SwitchBreakLoopInWhile {

  public static void main(String[] args) {
    StringBuilder sb = new StringBuilder();
    int n = 0;
    loop: while (true) {
      n++;
      switch (n) {
        case 2:
          continue loop;
        case 5:
          break loop;
        default:
          sb.append(" n").append(n);
      }
    }
    System.out.println(sb + " n=" + n);
  }
}
