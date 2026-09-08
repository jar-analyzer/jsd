public class StringBuilderFlow {

  public static void main(String[] args) {
    StringBuilderFlow s = new StringBuilderFlow();
    System.out.println(s.chain("x"));
    System.out.println(s.buildTable(3));
    System.out.println(s.mutate("hello"));
  }

  String chain(String seed) {
    StringBuilder sb = new StringBuilder(seed);
    sb.append("-").append(1).append('-').append(true).append('-').append(2.5);
    sb.insert(0, "[");
    sb.append("]");
    return sb.toString();
  }

  String buildTable(int n) {
    StringBuilder sb = new StringBuilder();
    for (int i = 1; i <= n; i++) {
      if (i > 1) {
        sb.append('|');
      }
      sb.append(i)
        .append(':')
        .append(i * i);
    }
    return sb.toString();
  }

  String mutate(String s) {
    StringBuilder sb = new StringBuilder(s);
    sb.reverse();
    sb.setCharAt(0, 'H');
    sb.deleteCharAt(sb.length() - 1);
    sb.append("!!");
    return sb.toString();
  }
}
