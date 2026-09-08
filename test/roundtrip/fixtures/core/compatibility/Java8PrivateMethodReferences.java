public class Java8PrivateMethodReferences {

  private String value() {
    return "private";
  }

  java.util.function.Supplier<String> ref() {
    return this::value;
  }

  public static void main(String[] args) {
    System.out.print(new Java8PrivateMethodReferences().ref().get());
  }
}
