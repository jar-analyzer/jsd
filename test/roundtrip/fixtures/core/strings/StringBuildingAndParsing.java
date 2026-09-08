public class StringBuildingAndParsing {

  public static void main(String[] args) {
    StringBuildingAndParsing s = new StringBuildingAndParsing();
    System.out.println(s.build(5));
    System.out.println(s.splitJoin("one,two,three", ','));
    System.out.println(s.charScan("hello world", 'o'));
    System.out.println(s.formatDemo("jsd", 3));
    System.out.println(s.parse("42", "0", "3.14"));
    System.out.println(s.escape());
  }

  String build(int n) {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < n; i++) {
      if (i > 0) sb.append("-");
      sb.append(i)
        .append('x')
        .append(i * i);
    }
    return sb.toString();
  }

  String splitJoin(String input, char sep) {
    String[] parts = input.split(String.valueOf(sep));
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < parts.length; i++) {
      sb.append('[').append(parts[i]).append(']');
    }
    return sb.toString();
  }

  String charScan(String text, char target) {
    int first = text.indexOf(target);
    int last = text.lastIndexOf(target);
    char c3 = text.charAt(0);
    return first + "/" + last + "/" + c3 + "/" + text.substring(0, 5);
  }

  String formatDemo(String name, int count) {
    return String.format("%s:%03d", name, count);
  }

  String parse(String i, String j, String d) {
    int a = Integer.parseInt(i);
    int b = Integer.parseInt(j, 10);
    double f = Double.parseDouble(d);
    return a + b + ":" + f;
  }

  String escape() {
    return "tab\\tnewline\\nquote\\\"backslash\\\\";
  }
}
