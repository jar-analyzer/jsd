public class JdkOverloads {

  public static void main(String[] args) {
    char[] value = { 65, 66 };
    System.out.println(String.valueOf((Object) value).startsWith("[C@"));
    System.out.println(String.valueOf((Object) null));
  }
}
