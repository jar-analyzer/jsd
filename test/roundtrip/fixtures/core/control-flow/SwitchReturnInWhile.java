public class SwitchReturnInWhile {

  public static void main(String[] args) {
    StringBuilder sb = new StringBuilder();
    int n = 0;
    while (true) {
      n++;
      switch (n) {
        case 3:
          System.out.println(sb + " n=" + n);
          return;
        default:
          sb.append(n);
      }
    }
  }
}
