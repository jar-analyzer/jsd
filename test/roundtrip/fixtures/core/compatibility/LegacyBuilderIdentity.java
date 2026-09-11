public class LegacyBuilderIdentity {

  static String builder(String value) {
    return new StringBuilder().append(value).toString();
  }

  static String buffer(String value) {
    return new StringBuffer().append(value).toString();
  }

  static String emptySuffix(String value) {
    return new StringBuilder().append(value).append("").toString();
  }

  public static void main(String[] args) {
    String value = "value";
    System.out.println(builder(value) == value);
    System.out.println(buffer(value) == value);
    System.out.println(emptySuffix(value) == value);
    System.out.println(builder(null));
    System.out.println(buffer(null));
    System.out.println(builder("") == "");
    System.out.println(buffer("") == "");
    System.out.println(emptySuffix("") == "");
    System.out.println(new StringBuilder().append((String) null).toString());
    System.out.println(new StringBuffer().append((String) null).toString());
  }
}
