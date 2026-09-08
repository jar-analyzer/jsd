public class BuilderIdentity {

  static int state;

  static class Value {

    public String toString() {
      return "v" + state;
    }
  }

  static String change() {
    state++;
    return "changed";
  }

  static class Sequence implements CharSequence {

    public int length() {
      return 2;
    }

    public char charAt(int index) {
      return index == 0 ? 'o' : 'k';
    }

    public CharSequence subSequence(int start, int end) {
      return "ok".substring(start, end);
    }

    public String toString() {
      return "different";
    }
  }

  public static void main(String[] args) {
    System.out.println(new StringBuilder().toString().length());
    System.out.println(new StringBuilder().append("x").toString() == "x");
    System.out.println(new StringBuffer().append(12).toString() == "12");
    System.out.println(new StringBuilder().append(-7).toString() == "-7");
    System.out.println(new StringBuilder().append((char) 65).toString() == "A");
    System.out.println(
      new StringBuilder()
        .append((Object) new Value())
        .append(change())
        .toString()
    );
    System.out.println(new StringBuilder().append((CharSequence) new Sequence()).toString());
    System.out.println(new StringBuffer().append((CharSequence) null).toString());
  }
}
