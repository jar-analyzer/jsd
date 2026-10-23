public class SwitchContinueInWhile {

  public static void main(String[] args) {
    StringBuilder sb = new StringBuilder();
    int n = 0;
    while (n < 5) {
      n++;
      switch (n) {
        case 2:
          sb.append('C');
          continue;
        default:
          sb.append("d").append(n);
      }
      sb.append('x');
    }
    System.out.println(sb);
  }
}
