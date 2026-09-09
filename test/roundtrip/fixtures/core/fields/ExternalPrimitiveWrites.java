public class ExternalPrimitiveWrites {

  public static void main(String[] args) {
    ExternalPrimitiveState.enabled = false;
    System.out.println(ExternalPrimitiveState.enabled);
    ExternalPrimitiveState.enabled = true;
    System.out.println(ExternalPrimitiveState.enabled);
    ExternalPrimitiveState state = new ExternalPrimitiveState();
    state.flag = false;
    System.out.println(state.flag);
    state.flag = true;
    System.out.println(state.flag);
    state.letter = 'x';
    System.out.println(state.letter);
  }
}

class ExternalPrimitiveState {

  static boolean enabled;
  boolean flag;
  char letter;
}
