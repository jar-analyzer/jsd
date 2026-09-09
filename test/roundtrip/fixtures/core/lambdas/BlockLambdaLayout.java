import java.util.function.Consumer;

public class BlockLambdaLayout {

  static void listen(Consumer<String> action) {
    action.accept(null);
    action.accept("}; { \"text\"");
  }

  public static void main(String[] args) {
    listen(value -> {
      if (value == null) {
        System.out.println("missing");
        return;
      }
      Runnable inner = () -> {
        System.out.println(value);
        System.out.println("nested");
      };
      inner.run();
    });
    Runnable anonymous = new Runnable() {
      String name = "anonymous";

      public void run() {
        listen(value -> {
          if (value != null) System.out.println(name + value);
          System.out.println("done");
        });
      }
    };
    anonymous.run();
  }
}
