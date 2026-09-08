public class FinallyContinue {

  public static void main(String[] args) {
    int n = 0;
    for (int i = 0; i < 4; i++) {
      try {
        if (i == 1) continue;
        if (i == 3) break;
        n += 10;
      } finally {
        n++;
      }
    }
    System.out.println(n);
  }
}
