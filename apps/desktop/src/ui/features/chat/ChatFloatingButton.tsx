import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkbenchStore } from "../../workbench/store";

// Bouton d'action flottant ancré en bas à droite de l'app. Il ouvre la chatbox
// globale `chat.main` et se masque dès qu'elle est ouverte (l'utilisateur la
// referme alors via son onglet ou l'entrée d'ActivityBar). Monté via le
// FeatureOverlay du chat, il survole l'ensemble du workbench.
const ChatFloatingButton = () => {
  const toggleView = useWorkbenchStore((s) => s.toggleView);
  const isChatOpen = useWorkbenchStore((s) => s.openViewIds.has("chat.main"));

  if (isChatOpen) return null;

  return (
    <Button
      variant="default"
      size="icon-lg"
      aria-label="Ouvrir le chat"
      onClick={() => toggleView("chat.main")}
      className="fixed right-4 bottom-4 z-50 rounded-full shadow-lg [&_svg:not([class*='size-'])]:size-5"
    >
      <MessageSquare />
    </Button>
  );
};

export default ChatFloatingButton;
