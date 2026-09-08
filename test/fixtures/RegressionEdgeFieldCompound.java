public class RegressionEdgeFieldCompound {

  static int calls;

  static class Box {

    int value;

    Box(int value) {
      this.value = value;
    }
  }

  static Box box;

  static Box get() {
    calls++;
    return box;
  }

  public static void main(String[] args) {
    box = new Box(5);
    System.out.println(get().value++);
    System.out.println(++get().value);
    get().value += 3;
    System.out.println(box.value + ":" + calls);
  }
}
