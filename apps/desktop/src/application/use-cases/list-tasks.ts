import type { TaskRepository } from "../ports/task-repository";

export const makeListTasks = (repository: TaskRepository) => () =>
  repository.list();

export type ListTasks = ReturnType<typeof makeListTasks>;
