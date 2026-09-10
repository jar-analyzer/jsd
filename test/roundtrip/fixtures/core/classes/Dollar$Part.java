public class Dollar$Part {

  private final int value;

  public Dollar$Part(int value) {
    this.value = value;
  }

  static class Member$Part {

    int value() {
      return 3;
    }
  }

  public static void main(String[] args) {
    Dollar$Part first = new Dollar$Part(7);
    Dollar$1 second = new Dollar$1();
    Dollar_Part third = new Dollar_Part();
    System.out.println(first.value);
    System.out.println(second.value());
    System.out.println(third.value());
    System.out.println(new Member$Part().value());
    System.out.println(Dollar$Part.class.getName());
    System.out.println(Dollar$1.class.getName());
  }
}

class Dollar$1 {

  int value() {
    return 8;
  }
}

class Dollar_Part {

  int value() {
    return 9;
  }
}
