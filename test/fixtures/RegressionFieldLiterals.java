public class RegressionFieldLiterals {

  public static final char QUOTE = '\'';
  public static final char SLASH = '\\';
  public static final char NEWLINE = '\n';
  public static final float FZERO = -0.0f;
  public static final double DZERO = -0.0d;
  public static final String TEXT = "\0\r\n\t😀";

  public static void main(String[] args) throws Exception {
    System.out.println((int) RegressionFieldLiterals.class.getField("QUOTE").getChar(null));
    System.out.println((int) RegressionFieldLiterals.class.getField("SLASH").getChar(null));
    System.out.println((int) RegressionFieldLiterals.class.getField("NEWLINE").getChar(null));
    System.out.println(1 / RegressionFieldLiterals.class.getField("FZERO").getFloat(null));
    System.out.println(1 / RegressionFieldLiterals.class.getField("DZERO").getDouble(null));
    System.out.println(
      ((String) RegressionFieldLiterals.class.getField("TEXT").get(null)).length()
    );
  }
}
