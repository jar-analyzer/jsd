public class ExternalFluentBuilder {

  public static void main(String[] args) {
    System.out.println(
      FluentBuilder.newBuilder()
        .add((Object) "one")
        .add((Object) "two")
        .build()
    );
    System.out.println(GenericFluent.create().set("seven").set("eight").build());
    GenericFluent<String> typed = GenericFluent.create();
    System.out.println(
      typed
        .add((Object) "three")
        .add((Object) "four")
        .build()
    );
    System.out.println(
      GenericFluent.create()
        .add((Object) "five")
        .add((Object) "six")
        .build()
    );
  }
}

class FluentBuilder {

  String text = "";

  static FluentBuilder newBuilder() {
    return new FluentBuilder();
  }

  FluentBuilder add(Object value) {
    text += "object:" + value + ";";
    return this;
  }

  FluentBuilder add(String value) {
    text += "string:" + value + ";";
    return this;
  }

  String build() {
    return text;
  }
}

class GenericFluent<T> {

  String text = "";

  static GenericFluent<String> create() {
    return new GenericFluent<>();
  }

  GenericFluent<T> add(Object value) {
    text += "object:" + value + ";";
    return this;
  }

  GenericFluent<T> add(String value) {
    text += "string:" + value + ";";
    return this;
  }

  GenericFluent<T> set(T value) {
    text += "typed:" + value + ";";
    return this;
  }

  String build() {
    return text;
  }
}
