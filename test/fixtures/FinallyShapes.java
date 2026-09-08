public class FinallyShapes {

  public static void main(String[] args) {
    FinallyShapes f = new FinallyShapes();
    System.out.println(f.closable(1));
    System.out.println(f.closable(0));
    System.out.println(Conn.actions);
  }

  int closable(int mode) {
    Conn c = mode == 1 ? new Conn("live") : null;
    try {
      return c == null ? 0 : c.send("hello");
    } finally {
      if (c != null) {
        c.disconnect();
      }
    }
  }

  static class Conn {

    static String actions = "";
    final String name;

    Conn(String name) {
      this.name = name;
      actions += "open " + name + ";";
    }

    int send(String msg) {
      actions += "send " + msg + ";";
      return msg.length();
    }

    void disconnect() {
      actions += "close " + name + ";";
    }
  }
}
