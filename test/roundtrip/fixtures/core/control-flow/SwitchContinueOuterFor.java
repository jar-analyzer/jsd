public class SwitchContinueOuterFor {

  public static void main(String[] args) {
    StringBuilder sb = new StringBuilder();
    outer: for (int i = 0; i < 6; i++) {
      switch (i) {
        case 1:
          continue outer;
        case 4:
          break outer;
        default:
          sb.append(i);
      }
    }
    System.out.println(sb);
  }
}
