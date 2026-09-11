public class EnumOverrideLegacy {

  enum E {
    A {
      int f() {
        return 1;
      }
    },
    B {
      int f() {
        return 2;
      }
    };

    abstract int f();
  }

  public static void main(String[] args) {
    System.out.println(E.A.f() + ":" + E.B.f());
  }
}
