import type { Task } from "../../domain/task";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TaskList = ({
  tasks,
  selectedId,
  onSelect,
}: {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (task: Task) => void;
}) => {
  return (
    <ul className="m-0 list-none p-0">
      {tasks.map((task) => {
        const subCount = task.subtasks?.length ?? 0;
        const isSelected = selectedId === task.id;
        return (
          <li
            key={task.id}
            onClick={() => onSelect(task)}
            className={cn(
              "cursor-pointer border-b border-border px-3 py-2.5 text-left transition-colors",
              "hover:bg-muted/60",
              isSelected && "bg-accent text-accent-foreground",
            )}
          >
            <div className="mb-0.5 flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold">{task.title}</span>
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {task.date}
              </span>
            </div>
            <p className="m-0 line-clamp-2 text-xs text-muted-foreground">
              {task.description}
            </p>
            {subCount > 0 && (
              <Badge variant="secondary" className="mt-1.5">
                {subCount} subtask{subCount > 1 ? "s" : ""}
              </Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default TaskList;
