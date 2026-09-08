public class LegacyJdk8PrivateRef {

  private String value() {
    return "private";
  }

  java.util.function.Supplier<String> ref() {
    return this::value;
  }

  public static void main(String[] args) {
    System.out.print(new LegacyJdk8PrivateRef().ref().get());
  }
}
