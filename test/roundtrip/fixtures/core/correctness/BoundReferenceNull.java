public class BoundReferenceNull {

  public static void main(String[] args) {
    String s = null;
    try {
      java.util.function.IntSupplier f = s::length;
      System.out.println("created");
      System.out.println(f.getAsInt());
    } catch (NullPointerException e) {
      System.out.println("creation");
    }
  }
}
