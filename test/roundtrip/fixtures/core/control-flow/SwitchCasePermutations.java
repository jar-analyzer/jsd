public class SwitchCasePermutations {

  static class SwitchOrder00 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 0:
          x = x * 10 + 1;
        case 1:
          x = x * 10 + 2;
          break;
        case 2:
          x = x * 10 + 3;
        default:
          x = x * 10 + 9;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder01 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 0:
          x = x * 10 + 1;
        case 1:
          x = x * 10 + 2;
          break;
        default:
          x = x * 10 + 9;
        case 2:
          x = x * 10 + 3;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder02 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 0:
          x = x * 10 + 1;
        case 2:
          x = x * 10 + 3;
        case 1:
          x = x * 10 + 2;
          break;
        default:
          x = x * 10 + 9;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder03 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 0:
          x = x * 10 + 1;
        case 2:
          x = x * 10 + 3;
        default:
          x = x * 10 + 9;
        case 1:
          x = x * 10 + 2;
          break;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder04 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 0:
          x = x * 10 + 1;
        default:
          x = x * 10 + 9;
        case 1:
          x = x * 10 + 2;
          break;
        case 2:
          x = x * 10 + 3;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder05 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 0:
          x = x * 10 + 1;
        default:
          x = x * 10 + 9;
        case 2:
          x = x * 10 + 3;
        case 1:
          x = x * 10 + 2;
          break;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder06 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 1:
          x = x * 10 + 2;
          break;
        case 0:
          x = x * 10 + 1;
        case 2:
          x = x * 10 + 3;
        default:
          x = x * 10 + 9;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder07 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 1:
          x = x * 10 + 2;
          break;
        case 0:
          x = x * 10 + 1;
        default:
          x = x * 10 + 9;
        case 2:
          x = x * 10 + 3;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder08 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 1:
          x = x * 10 + 2;
          break;
        case 2:
          x = x * 10 + 3;
        case 0:
          x = x * 10 + 1;
        default:
          x = x * 10 + 9;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder09 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 1:
          x = x * 10 + 2;
          break;
        case 2:
          x = x * 10 + 3;
        default:
          x = x * 10 + 9;
        case 0:
          x = x * 10 + 1;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder10 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 1:
          x = x * 10 + 2;
          break;
        default:
          x = x * 10 + 9;
        case 0:
          x = x * 10 + 1;
        case 2:
          x = x * 10 + 3;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder11 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 1:
          x = x * 10 + 2;
          break;
        default:
          x = x * 10 + 9;
        case 2:
          x = x * 10 + 3;
        case 0:
          x = x * 10 + 1;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder12 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 2:
          x = x * 10 + 3;
        case 0:
          x = x * 10 + 1;
        case 1:
          x = x * 10 + 2;
          break;
        default:
          x = x * 10 + 9;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder13 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 2:
          x = x * 10 + 3;
        case 0:
          x = x * 10 + 1;
        default:
          x = x * 10 + 9;
        case 1:
          x = x * 10 + 2;
          break;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder14 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 2:
          x = x * 10 + 3;
        case 1:
          x = x * 10 + 2;
          break;
        case 0:
          x = x * 10 + 1;
        default:
          x = x * 10 + 9;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder15 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 2:
          x = x * 10 + 3;
        case 1:
          x = x * 10 + 2;
          break;
        default:
          x = x * 10 + 9;
        case 0:
          x = x * 10 + 1;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder16 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 2:
          x = x * 10 + 3;
        default:
          x = x * 10 + 9;
        case 0:
          x = x * 10 + 1;
        case 1:
          x = x * 10 + 2;
          break;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder17 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        case 2:
          x = x * 10 + 3;
        default:
          x = x * 10 + 9;
        case 1:
          x = x * 10 + 2;
          break;
        case 0:
          x = x * 10 + 1;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder18 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        default:
          x = x * 10 + 9;
        case 0:
          x = x * 10 + 1;
        case 1:
          x = x * 10 + 2;
          break;
        case 2:
          x = x * 10 + 3;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder19 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        default:
          x = x * 10 + 9;
        case 0:
          x = x * 10 + 1;
        case 2:
          x = x * 10 + 3;
        case 1:
          x = x * 10 + 2;
          break;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder20 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        default:
          x = x * 10 + 9;
        case 1:
          x = x * 10 + 2;
          break;
        case 0:
          x = x * 10 + 1;
        case 2:
          x = x * 10 + 3;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder21 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        default:
          x = x * 10 + 9;
        case 1:
          x = x * 10 + 2;
          break;
        case 2:
          x = x * 10 + 3;
        case 0:
          x = x * 10 + 1;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder22 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        default:
          x = x * 10 + 9;
        case 2:
          x = x * 10 + 3;
        case 0:
          x = x * 10 + 1;
        case 1:
          x = x * 10 + 2;
          break;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  static class SwitchOrder23 {

    static int f(int n) {
      int x = 0;
      switch (n) {
        default:
          x = x * 10 + 9;
        case 2:
          x = x * 10 + 3;
        case 1:
          x = x * 10 + 2;
          break;
        case 0:
          x = x * 10 + 1;
      }
      return x;
    }

    public static void main(String[] args) {
      for (int i = -1; i < 4; i++) System.out.println(f(i));
    }
  }

  public static void main(String[] args) {
    SwitchOrder00.main(args);
    SwitchOrder01.main(args);
    SwitchOrder02.main(args);
    SwitchOrder03.main(args);
    SwitchOrder04.main(args);
    SwitchOrder05.main(args);
    SwitchOrder06.main(args);
    SwitchOrder07.main(args);
    SwitchOrder08.main(args);
    SwitchOrder09.main(args);
    SwitchOrder10.main(args);
    SwitchOrder11.main(args);
    SwitchOrder12.main(args);
    SwitchOrder13.main(args);
    SwitchOrder14.main(args);
    SwitchOrder15.main(args);
    SwitchOrder16.main(args);
    SwitchOrder17.main(args);
    SwitchOrder18.main(args);
    SwitchOrder19.main(args);
    SwitchOrder20.main(args);
    SwitchOrder21.main(args);
    SwitchOrder22.main(args);
    SwitchOrder23.main(args);
  }
}
