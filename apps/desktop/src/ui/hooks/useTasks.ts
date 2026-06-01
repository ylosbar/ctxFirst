import { useEffect, useState } from "react";
import type { Task } from "../../domain/task";
import { useServices } from "../di/services-provider";

export function useTasks(): Task[] {
  const { listTasks } = useServices();
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    let cancelled = false;
    listTasks().then((result) => {
      if (!cancelled) setTasks(result);
    });
    return () => {
      cancelled = true;
    };
  }, [listTasks]);

  return tasks;
}
