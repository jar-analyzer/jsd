public class SwitchBreakDoesNotExitLoop {

  public static void main(String[] args) {
    StringBuilder sb = new StringBuilder();
    int n = 0;
    outer: while (true) {
      switch (n++) {
        case 0:
          sb.append('a');
          break;
        default:
          sb.append('b');
          if (n == 3) break outer;
          break;
      }
    }
    sb.append(n);
    System.out.println(sb);
  }
}
