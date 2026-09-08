public class ExternalOverload {

  static class Seq implements CharSequence {

    public int length() {
      return 3;
    }

    public char charAt(int i) {
      return 'x';
    }

    public CharSequence subSequence(int a, int b) {
      return "xxx";
    }

    public String toString() {
      return "object";
    }
  }

  public static void main(String[] args) {
    StringBuilder b = new StringBuilder();
    b.append((Object) new Seq());
    System.out.print(b.toString());
  }
}
