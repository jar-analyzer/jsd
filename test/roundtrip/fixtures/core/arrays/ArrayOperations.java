import java.util.Arrays;
import java.util.List;

public class ArrayOperations {

  public static void main(String[] args) {
    int[] a = new int[5];
    for (int i = 0; i < a.length; i++) a[i] = i * i;
    System.out.println(Arrays.toString(a));

    int[] b = { 3, 1, 4, 1, 5, 9, 2, 6 };
    Arrays.sort(b);
    System.out.println(Arrays.toString(b));
    System.out.println(Arrays.binarySearch(b, 5));

    int[][] grid = new int[3][3];
    for (int r = 0; r < grid.length; r++) for (int c = 0; c < grid[r].length; c++) grid[r][c] =
      r * 3 + c;
    System.out.println(Arrays.deepToString(grid));

    int[][] jagged = new int[3][];
    for (int i = 0; i < jagged.length; i++) {
      jagged[i] = new int[i + 1];
      for (int j = 0; j <= i; j++) jagged[i][j] = i + j;
    }
    System.out.println(Arrays.deepToString(jagged));

    String[] words = { "x", "y", "z" };
    List<String> l = Arrays.asList(words);
    System.out.println(l.size() + " " + l.get(1));

    ArrayOperations t = new ArrayOperations();
    System.out.println(t.varSum());
    System.out.println(t.varSum(1, 2));
    System.out.println(t.varSum(1, 2, 3, 4, 5));
    System.out.println(t.safeGet(a, 2) + " " + t.safeGet(a, 99));

    double[] ds = { 1.5, 2.5 };
    System.out.println(t.total(ds));
    char[] cs = { 'h', 'i' };
    System.out.println(new String(cs));
    boolean[] flags = new boolean[] { true, false, true };
    System.out.println(flags[0] + " " + flags[1] + " " + flags[2]);
  }

  int varSum(int... values) {
    int s = 0;
    for (int v : values) s += v;
    return s;
  }

  int safeGet(int[] arr, int idx) {
    try {
      return arr[idx];
    } catch (ArrayIndexOutOfBoundsException ex) {
      return -1;
    }
  }

  double total(double[] ds) {
    double t = 0;
    for (double d : ds) t += d;
    return t;
  }
}
