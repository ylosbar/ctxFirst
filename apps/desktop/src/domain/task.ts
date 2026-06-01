export type SubTask = {
  id: string;
  parentId: string;
  title: string;
  date: string;
  description: string;
};

export type Task = {
  id: string;
  title: string;
  date: string;
  description: string;
  subtasks?: SubTask[];
};
