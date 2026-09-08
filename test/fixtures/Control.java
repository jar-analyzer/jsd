public class Control {

  public static void main(String[] args) {
    Control c = new Control();
    System.out.println(c.grade(95));
    System.out.println(c.grade(85));
    System.out.println(c.grade(75));
    System.out.println(c.grade(65));
    System.out.println(c.grade(10));
    System.out.println(c.fizz(15));
    System.out.println(c.fizz(9));
    System.out.println(c.fizz(7));
    System.out.println(c.fizz(13));
    c.loops();
    c.labels();
    System.out.println(c.abs(-5) + " " + c.abs(5));
    System.out.println(c.max3(3, 9, 1));
    System.out.println(c.boolOps(true, false));
    System.out.println(c.sumWhile(10));
    System.out.println(c.firstDivisible(new int[] { 3, 7, 12, 18 }, 6));
  }

  String grade(int score) {
    String g;
    if (score >= 90) {
      g = "A";
    } else if (score >= 80) {
      g = "B";
    } else if (score >= 70) {
      g = "C";
    } else if (score >= 60) {
      g = "D";
    } else {
      g = "F";
    }
    return g;
  }

  String fizz(int n) {
    if (n % 15 == 0) return "FizzBuzz";
    if (n % 3 == 0) return "Fizz";
    if (n % 5 == 0) return "Buzz";
    return String.valueOf(n);
  }

  void loops() {
    int sum = 0;
    for (int i = 1; i <= 10; i++) {
      if (i % 2 == 0) continue;
      sum += i;
    }
    System.out.println(sum);

    int j = 0;
    while (j < 100) {
      j += 7;
      if (j > 50) break;
    }
    System.out.println(j);

    int k = 10;
    do {
      k--;
    } while (k > 5);
    System.out.println(k);

    for (int a = 0; a < 3; a++) {
      for (int b = 0; b < 3; b++) {
        if (b == 2) continue;
        if (a == 2) break;
        System.out.print(a + "" + b + " ");
      }
    }
    System.out.println();
  }

  void labels() {
    outer: for (int i = 0; i < 5; i++) {
      for (int j = 0; j < 5; j++) {
        if (j == 3) continue outer;
        if (i == 4) break outer;
        System.out.print(i * 10 + j + " ");
      }
    }
    System.out.println();
  }

  int abs(int x) {
    return x < 0 ? -x : x;
  }

  int max3(int a, int b, int c) {
    int m = a;
    if (b > m) m = b;
    if (c > m) m = c;
    return m;
  }

  boolean boolOps(boolean a, boolean b) {
    return (a && !b) || (!a && b);
  }

  int sumWhile(int n) {
    int s = 0,
      i = 1;
    while (i <= n) {
      s += i;
      i++;
    }
    return s;
  }

  int firstDivisible(int[] arr, int d) {
    for (int v : arr) {
      if (v % d == 0) return v;
    }
    return -1;
  }
}
