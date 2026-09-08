import java.util.Arrays;

public class MultidimensionalArrayOperations {

  public static void main(String[] args) {
    MultidimensionalArrayOperations m = new MultidimensionalArrayOperations();
    System.out.println(m.multi());
    System.out.println(Arrays.toString(m.filled()));
    System.out.println(m.jagged());
    System.out.println(m.copy());
  }

  int multi() {
    int[][] grid = new int[3][4];
    for (int i = 0; i < grid.length; i++) {
      for (int j = 0; j < grid[i].length; j++) {
        grid[i][j] = i * j;
      }
    }
    int sum = 0;
    for (int[] row : grid) {
      for (int v : row) {
        sum += v;
      }
    }
    return sum;
  }

  int[] filled() {
    int[] a = { 3, 1, 4, 1, 5, 9, 2, 6 };
    Arrays.sort(a);
    int[] b = new int[4];
    System.arraycopy(a, 2, b, 0, 4);
    return b;
  }

  int jagged() {
    int[][] j = new int[4][];
    for (int i = 0; i < j.length; i++) {
      j[i] = new int[i + 1];
      for (int k = 0; k < j[i].length; k++) {
        j[i][k] = i + k;
      }
    }
    int total = 0;
    for (int i = 0; i < j.length; i++) {
      for (int k = 0; k < j[i].length; k++) {
        total += j[i][k];
      }
    }
    return total;
  }

  int copy() {
    long[] src = { 1L, 2L, 3L };
    long[] dst = new long[3];
    System.arraycopy(src, 0, dst, 1, 2);
    return (int) (dst[0] + dst[1] + dst[2]);
  }
}
