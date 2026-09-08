public class StringsT {

  public static void main(String[] args) {
    StringsT s = new StringsT();
    System.out.println(s.describe("hello"));
    System.out.println(s.describe(""));
    System.out.println(s.describe("a"));
    System.out.println(s.describe("world"));
    System.out.println(s.repeat("ab", 3));
    System.out.println(s.count("banana", 'a'));
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < 5; i++) sb.append(i).append(',');
    System.out.println(sb.toString());
    System.out.println(s.escapes());
    System.out.println("concat".concat("+").toUpperCase());
    String template = "%s=%d";
    System.out.println(String.format(template, "x", 42));
    System.out.println(s.reverse("stressed"));
    System.out.println(s.isPalindrome("level") + " " + s.isPalindrome("hello"));
  }

  String describe(String s) {
    if (s == null) return "null";
    switch (s.length()) {
      case 0:
        return "empty";
      case 1:
        return "single: " + s;
      default:
        return s.length() + " chars: " + s + "!";
    }
  }

  String repeat(String s, int n) {
    String out = "";
    for (int i = 0; i < n; i++) {
      out = out + s;
      if (out.length() > 20) break;
    }
    return out;
  }

  int count(String s, char c) {
    int n = 0;
    for (int i = 0; i < s.length(); i++) {
      if (s.charAt(i) == c) n++;
    }
    return n;
  }

  String escapes() {
    return "tab\there\nnewline \"quoted\" back\\slash unicodeé";
  }

  String reverse(String s) {
    return new StringBuilder(s).reverse().toString();
  }

  boolean isPalindrome(String s) {
    int i = 0,
      j = s.length() - 1;
    while (i < j) {
      if (s.charAt(i) != s.charAt(j)) return false;
      i++;
      j--;
    }
    return true;
  }
}
