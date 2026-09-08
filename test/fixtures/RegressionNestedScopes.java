public class RegressionNestedScopes {

  java.util.Date util;
  java.sql.Date sql;

  static class Left {

    java.util.List<String> list;
    java.util.Date date;
  }

  static class Right {

    java.awt.List list;
    java.sql.Date date;
  }

  public static void main(String[] args) throws Exception {
    System.out.println(Left.class.getDeclaredField("list").getType().getName());
    System.out.println(Right.class.getDeclaredField("list").getType().getName());
    System.out.println(RegressionNestedScopes.class.getDeclaredField("util").getType().getName());
    System.out.println(RegressionNestedScopes.class.getDeclaredField("sql").getType().getName());
  }
}
