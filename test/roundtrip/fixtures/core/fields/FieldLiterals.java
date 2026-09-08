public class FieldLiterals {

  public static final char QUOTE = '\'';
  public static final char SLASH = '\\';
  public static final char NEWLINE = '\n';
  public static final float FZERO = -0.0f;
  public static final double DZERO = -0.0d;
  public static final String TEXT = "\0\r\n\t😀";

  public static void main(String[] args) throws Exception {
    System.out.println((int) FieldLiterals.class.getField("QUOTE").getChar(null));
    System.out.println((int) FieldLiterals.class.getField("SLASH").getChar(null));
    System.out.println((int) FieldLiterals.class.getField("NEWLINE").getChar(null));
    System.out.println(1 / FieldLiterals.class.getField("FZERO").getFloat(null));
    System.out.println(1 / FieldLiterals.class.getField("DZERO").getDouble(null));
    System.out.println(((String) FieldLiterals.class.getField("TEXT").get(null)).length());
  }
}
