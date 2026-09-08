public class RegressionUnicode {

  public static void main(String[] args) {
    String s = "\0😀\ud800\udfff\ufeff\u07ff\u0800中文";
    System.out.println(s.length());
    for (int i = 0; i < s.length(); i++) System.out.println((int) s.charAt(i));
  }
}
