public class VarargsCall {

  public static void main(String[] args) {
    VarargsCall v = new VarargsCall();
    System.out.println(v.sum());
    System.out.println(v.sum(1));
    System.out.println(v.sum(1, 2, 3, 4, 5));
    System.out.println(v.sum(new int[] { 10, 20 }));
    System.out.println(v.join("-", "a", "b", "c"));
    System.out.println(v.gmix(1, 1.5, "x", "y"));
  }

  int sum(int... nums) {
    int total = 0;
    for (int n : nums) {
      total += n;
    }
    return total;
  }

  String join(String sep, String... parts) {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < parts.length; i++) {
      if (i > 0) {
        sb.append(sep);
      }
      sb.append(parts[i]);
    }
    return sb.toString();
  }

  String gmix(Object... items) {
    String out = "";
    for (Object o : items) {
      out += o.getClass().getSimpleName().charAt(0);
    }
    return out;
  }
}
