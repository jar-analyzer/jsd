public class DeepNesting {

  public static void main(String[] args) {
    DeepNesting d = new DeepNesting();
    System.out.println(d.labeled(3, 3));
    System.out.println(d.tryInLoop("a1b2c3"));
  }

  int labeled(int rows, int cols) {
    int total = 0;
    outer: for (int i = 0; i < rows; i++) {
      for (int j = 0; j < cols; j++) {
        if (i * j > 2) continue outer;
        if (i + j > 4) break outer;
        for (int k = 0; k < 2; k++) {
          if (k == 1 && j == 1) continue outer;
          total += k;
        }
        total += 1;
      }
      total += 10;
    }
    return total;
  }

  int tryInLoop(String s) {
    int digits = 0;
    for (int i = 0; i < s.length(); i++) {
      try {
        int n = Integer.parseInt(s.substring(i, i + 1));
        digits += n;
      } catch (NumberFormatException e) {
        continue;
      } finally {
        digits += 0;
      }
    }
    return digits;
  }
}
