public class ArrayClassLiterals {

  public static void main(String[] args) {
    Class<?> arrayType = long[][].class;
    Object token = int[].class;
    System.out.println(arrayType.getName());
    System.out.println(token instanceof Class);
    System.out.println(int[].class.getName());
    System.out.println(String[][].class.getName());
    System.out.println(boolean[][][].class.getComponentType().getName());
  }
}
