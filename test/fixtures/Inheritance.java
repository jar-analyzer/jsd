public class Inheritance {

  public static void main(String[] args) {
    Animal dog = new Dog("Rex");
    Animal cat = new Cat("Tom");
    System.out.println(dog.speak());
    System.out.println(cat.speak());
    System.out.println(dog.describe());
    System.out.println(((Dog) dog).fetch());
    System.out.println(Animal.count);

    Shape c = new Circle(3);
    Shape r = new Rect(4, 5);
    System.out.println(c.area());
    System.out.println(r.area());
    System.out.println(Shape.label(c));
  }

  abstract static class Animal {

    static int count = 0;
    final String name;

    Animal(String name) {
      this.name = name;
      count++;
    }

    abstract String speak();

    String describe() {
      return name + " is a " + getClass().getSimpleName();
    }
  }

  static class Dog extends Animal {

    Dog(String name) {
      super(name);
    }

    @Override
    String speak() {
      return name + " says woof";
    }

    String fetch() {
      return name + " fetches";
    }
  }

  static class Cat extends Animal {

    Cat(String name) {
      super(name);
    }

    @Override
    String speak() {
      return name + " says meow";
    }
  }

  interface Shape {
    double area();

    static String label(Shape s) {
      return s.getClass().getSimpleName() + ":" + s.area();
    }
  }

  static class Circle implements Shape {

    final double r;

    Circle(double r) {
      this.r = r;
    }

    @Override
    public double area() {
      return Math.PI * r * r;
    }
  }

  static class Rect implements Shape {

    final double w;
    final double h;

    Rect(double w, double h) {
      this.w = w;
      this.h = h;
    }

    @Override
    public double area() {
      return w * h;
    }
  }
}
