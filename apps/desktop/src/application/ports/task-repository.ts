import type { Task } from "../../domain/task";

export interface TaskRepository {
  list(): Promise<Task[]>;
}
