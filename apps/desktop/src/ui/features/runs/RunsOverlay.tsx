import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { Toast } from "@base-ui/react/toast";
import {
  useActiveEditor,
  useWorkbench,
} from "../../workbench/WorkbenchProvider";
import { instanceIdFromRunUri } from "./run-uri";
import { useNotifyActiveInstance } from "../../stores/runs-store";
import NewRunDialog from "./NewRunDialog";
import RunsShortcuts from "./RunsShortcuts";
import RunsToaster from "./RunsToaster";

const NEW_RUN_PATH = "/runs/new";

const ActiveInstanceTracker = () => {
  const activeEditor = useActiveEditor();
  const notifyActiveInstance = useNotifyActiveInstance();
  useEffect(() => {
    const id = activeEditor ? instanceIdFromRunUri(activeEditor.uri) : null;
    notifyActiveInstance(id);
  }, [activeEditor, notifyActiveInstance]);
  return null;
};

const NewRunDialogHost = () => {
  const wb = useWorkbench();
  const navigate = useNavigate();
  const location = useLocation();
  const open = location.pathname === NEW_RUN_PATH;

  const handleClose = () => {
    const active = wb.activeEditor();
    const activeId = active ? instanceIdFromRunUri(active.uri) : null;
    if (activeId) {
      navigate(`/runs/${activeId}`, { replace: true });
    } else {
      navigate("/runs", { replace: true });
    }
  };

  return <NewRunDialog open={open} onClose={handleClose} />;
};

const RunsOverlay = () => {
  return (
    <Toast.Provider>
      <ActiveInstanceTracker />
      <RunsShortcuts />
      <NewRunDialogHost />
      <RunsToaster />
    </Toast.Provider>
  );
};

export default RunsOverlay;
