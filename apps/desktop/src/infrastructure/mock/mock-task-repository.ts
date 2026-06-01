import type { TaskRepository } from "../../application/ports/task-repository";
import tasksData from "../../mocks/tasks.json";

export const createMockTaskRepository = (): TaskRepository => ({
  async list() {
    return tasksData;
  },
});
