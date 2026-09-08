public class RegressionPlanMultiCatch {

  public static void main(String[] args) {
    for (int i = 0; i < 3; i++) try {
      if (i == 0) throw new IllegalArgumentException();
      if (i == 1) throw new IllegalStateException();
      throw new RuntimeException();
    } catch (IllegalArgumentException | IllegalStateException e) {
      System.out.println("multi");
    } catch (RuntimeException e) {
      System.out.println("other");
    }
  }
}
