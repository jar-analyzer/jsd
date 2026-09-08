import java.util.List;

public class UnknownOverloadBoundaries {

  public static void main(String[] args) {
    System.out.println(MissingOverloads.pick((Object) "value"));
    MissingGeneric<String> receiver = new MissingGeneric<>();
    System.out.println(receiver.pick((Object) "value"));
    String identity = MissingOverloads.identity("generic");
    List<String> values = MissingOverloads.singleton(identity);
    System.out.println(values.get(0));
    MissingOverloads.pick((Object) "ignored");
    int i = 0;
    for (MissingOverloads.pick((Object) "start"); i < 1; MissingOverloads.pick((Object) "end")) i++;
    System.out.println(i);
  }
}

class MissingOverloads {

  static Object pick(Object value) {
    return "object";
  }

  static Object pick(String value) {
    return "string";
  }

  static <T> T identity(T value) {
    return value;
  }

  static <T> List<T> singleton(T value) {
    return java.util.Collections.singletonList(value);
  }
}

class MissingGeneric<T> {

  String pick(Object value) {
    return "object";
  }

  String pick(String value) {
    return "string";
  }
}
