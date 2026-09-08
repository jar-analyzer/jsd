public class LoopReturns {

  public static void main(String[] args) {
    LoopReturns l = new LoopReturns();
    System.out.println(l.findFirst(new int[] { 5, 3, 8, 8, 2 }, 8));
    System.out.println(l.findFirst(new int[] { 1, 2, 3 }, 9));
    System.out.println(l.scan(null));
    System.out.println(l.scan("alpha"));
    System.out.println(l.scan("beta gamma"));
    System.out.println(l.nestedLoops(2, 3));
    System.out.println(l.withContinue(6));
  }

  int findFirst(int[] data, int target) {
    for (int i = 0; i < data.length; i++) {
      if (data[i] == target) {
        return i;
      }
    }
    return -1;
  }

  String scan(String s) {
    if (s == null) return "none";
    for (int i = 0; i < s.length(); i++) {
      char ch = s.charAt(i);
      if (ch == 'a') continue;
      if (ch == ' ') return "space@" + i;
      if (i > 10) return "long";
    }
    return "clean:" + s;
  }

  int nestedLoops(int rows, int cols) {
    int total = 0;
    outer: for (int i = 0; i < rows; i++) {
      for (int j = 0; j < cols; j++) {
        if (j == 2 && i == 1) {
          total += 100;
          continue outer;
        }
        if (i + j > 4) {
          break outer;
        }
        total += 1;
      }
      total += 10;
    }
    return total;
  }

  int withContinue(int n) {
    int sum = 0;
    for (int i = 0; i < n; i++) {
      if (i % 2 != 0) continue;
      if (i == 4) break;
      sum += i;
    }
    return sum;
  }
}
