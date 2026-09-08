public class RegressionHiddenFieldWrites {

  static class Parent {

    int value = 1;
  }

  static class Child extends Parent {

    int value = 2;

    int change(Child other) {
      ((Parent) this).value = 3;
      ((Parent) other).value += 4;
      return ((Parent) this).value * 100 + ((Parent) other).value * 10 + other.value;
    }
  }

  public static void main(String[] args) {
    System.out.print(new Child().change(new Child()));
  }
}
