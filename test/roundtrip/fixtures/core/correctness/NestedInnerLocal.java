public class NestedInnerLocal {

  static class B {

    int f() {
      return 3;
    }
  }

  static class Other {

    class B {

      int f() {
        return 9;
      }
    }
  }

  static class A {

    class B {

      int f() {
        return 7;
      }
    }
  }

  public static void main(String[] a) {
    A x = new A();
    A.B y = x.new B();
    System.out.println(y.f());
    B direct = new B();
    Other other = new Other();
    Other.B sibling = other.new B();
    System.out.println(direct.f() + ":" + sibling.f());
  }
}
