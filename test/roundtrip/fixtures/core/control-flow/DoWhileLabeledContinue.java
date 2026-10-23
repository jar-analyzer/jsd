public class DoWhileLabeledContinue {

  public static void main(String[] args) {
    StringBuilder sb = new StringBuilder();
    int i = 0;
    outer: do {
      i++;
      for (int j = 0; j < 3; j++) {
        if (i * 10 + j == 12) continue outer;
        if (i > 4) break outer;
        sb.append(i).append('.').append(j).append(' ');
      }
    } while (i < 10);
    sb.append("| i=").append(i);
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
