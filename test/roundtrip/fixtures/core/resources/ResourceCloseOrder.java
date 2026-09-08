public class ResourceCloseOrder {

  public static void main(String[] args) throws Exception {
    try (Res a = new Res("a")) {
      System.out.println("body " + a.name);
    }
    System.out.println(Res.log);

    try (Res b = new Res("b"); Res c = new Res("c")) {
      System.out.println("pair " + b.name + c.name);
    } catch (Exception ex) {
      System.out.println("pair caught " + ex.getMessage());
    }
    System.out.println(Res.log);
  }

  static class Res implements AutoCloseable {

    static final StringBuilder log = new StringBuilder();
    final String name;

    Res(String name) {
      this.name = name;
      log.append("open ").append(name).append(';');
    }

    @Override
    public void close() {
      log.append("close ").append(name).append(';');
    }
  }
}
