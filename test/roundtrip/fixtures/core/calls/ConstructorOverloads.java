public class ConstructorOverloads {

  public ConstructorOverloads(Object b) {
    System.out.println("obj");
  }

  public ConstructorOverloads(String b) {
    System.out.println("str");
  }

  public static void main(String[] a) {
    new ConstructorOverloads((Object) "x");
  }
}
