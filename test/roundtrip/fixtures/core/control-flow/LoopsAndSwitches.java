public class LoopsAndSwitches {

  public static void main(String[] args) {
    LoopsAndSwitches f = new LoopsAndSwitches();
    System.out.println(f.doWhileSum(5));
    System.out.println(f.nestedLoops(4, 4));
    System.out.println(f.charSwitch('b'));
    System.out.println(f.charSwitch('z'));
    System.out.println(f.enumSwitch(Day.FRI));
    System.out.println(f.whileTrue(10));
    System.out.println(f.assertDemo(3));
    try {
      f.assertDemo(-1);
    } catch (AssertionError e) {
      System.out.println("assert-failed: " + e.getMessage());
    }
  }

  int doWhileSum(int n) {
    int i = 0;
    int sum = 0;
    do {
      sum += i;
      i++;
    } while (i < n);
    return sum;
  }

  int nestedLoops(int rows, int cols) {
    int cells = 0;
    int edge = 0;
    outer: for (int i = 0; i < rows; i++) {
      for (int j = 0; j < cols; j++) {
        cells++;
        if (j > i) {
          continue outer;
        }
        if (i == j) edge++;
      }
    }
    return cells * 100 + edge;
  }

  String charSwitch(char c) {
    switch (c) {
      case 'a':
        return "alpha";
      case 'b':
        return "beta";
      case 'c':
      case 'd':
        return "c-or-d";
      default:
        return "other";
    }
  }

  enum Day {
    MON,
    TUE,
    WED,
    THU,
    FRI,
    SAT,
    SUN,
  }

  String enumSwitch(Day d) {
    switch (d) {
      case SAT:
      case SUN:
        return "weekend";
      case FRI:
        return "almost";
      default:
        return "workday";
    }
  }

  int whileTrue(int n) {
    int acc = 0;
    while (true) {
      if (acc >= n) break;
      acc += 3;
      if (acc % 2 == 0) continue;
      acc += 1;
    }
    return acc;
  }

  int assertDemo(int v) {
    assert v >= 0 : "negative " + v;
    return v * 2;
  }
}
