public class SwitchBreakLoopInDefault {

  public static void main(String[] args) {
    StringBuilder sb = new StringBuilder();
    int n = 0;
    loop: while (true) {
      n++;
      switch (n) {
        default:
          sb.append(n);
          if (n > 3) break loop;
        case 9:
          break;
      }
    }
    System.out.println(sb + " n=" + n);
  }
}
