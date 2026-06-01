import { Calendar } from "lucide-react";
import { createElement } from "react";
import { workbenchRegistry } from "../../workbench/registry";
import SchedulesView from "./SchedulesView";

// Activité dédiée "Planifications" — sortie de l'Explorer, à côté de "Runs"
// (order 20) et avant "Chat". Comme la vue runs.list, schedules.list est
// activity-bound : seule visible quand l'activité Schedules est active.
workbenchRegistry.registerActivity({
  id: "schedules",
  title: "Planifications",
  icon: Calendar,
  defaultView: "schedules.list",
  order: 25,
  route: "/schedules",
});

workbenchRegistry.registerView({
  id: "schedules.list",
  defaultLocation: "left",
  title: "Planifications",
  icon: Calendar,
  activity: "schedules",
  priority: 50,
  render: () => createElement(SchedulesView),
});
