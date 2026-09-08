public class RegressionFieldHide {

  static class Parent {

    int x = 1;
  }

  static class Child extends Parent {

    int x = 2;

    int sum() {
      return ((Parent) this).x * 10 + this.x;
    }
  }

  public static void main(String[] args) {
    System.out.print(new Child().sum());
  }
}
