public class NonSealedSubclass {

  sealed interface Base permits Child {}

  static non-sealed class Child implements Base {}

  public static void main(String[] args) {
    System.out.print(new Child() instanceof Base);
  }
}
