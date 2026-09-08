public class TextBlocks {

  public static void main(String[] args) {
    String json = """
    {"a": 1}""";
    String multi = """
    line1
    line2""";
    System.out.println(json.trim());
    System.out.println(multi.replace("\n", "|"));
  }
}
