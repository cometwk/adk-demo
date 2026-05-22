"use client";

import { ClipboardIcon, FileUpIcon, NetworkIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { createChatFromUserText } from "@/app/(chat)/actions";
import { getChatHistoryPaginationKey } from "@/components/chat/sidebar-history";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type InputMode = "file" | "paste";

// Preset scenarios for quick input
const PRESET_SCENARIOS = ["S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"];

interface GraphAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GraphAgentDialog({
  open,
  onOpenChange,
}: GraphAgentDialogProps) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [mode, setMode] = useState<InputMode>("paste");
  const [textContent, setTextContent] = useState("S0");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    setIsLoading(true);
    try {
      const content = await file.text();
      setTextContent(content);
      setMode("paste");
    } catch {
      toast.error("Failed to read file");
    }
    setIsLoading(false);
  };

  const handleCreate = async () => {
    if (!textContent.trim()) {
      toast.error("Please provide text content");
      return;
    }

    setIsLoading(true);
    try {
      const result = await createChatFromUserText({ text: textContent });

      if (result.error) {
        toast.error(result.error);
        setIsLoading(false);
        return;
      }

      // Refresh history list
      mutate(unstable_serialize(getChatHistoryPaginationKey));

      // Close dialog and navigate to the new chat
      onOpenChange(false);
      setTextContent("");

      // Agent chat: add ?agent=1 to trigger auto request
      const agentParam = result.isAgentChat ? "?agent=1" : "";
      router.push(`/chat/${result.chatId}${agentParam}`);

      toast.success("Chat created successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create chat";
      toast.error(message);
    }
    setIsLoading(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setTextContent("");
      setMode("file");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NetworkIcon className="size-5" />
            Graph Agent
          </DialogTitle>
          <DialogDescription>
            Upload a file or enter text as the first user message to start a new chat.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 py-2">
          <Button
            className="flex-1"
            onClick={() => setMode("file")}
            size="sm"
            variant={mode === "file" ? "default" : "outline"}
          >
            <FileUpIcon className="size-4" />
            Upload File
          </Button>
          <Button
            className="flex-1"
            onClick={() => setMode("paste")}
            size="sm"
            variant={mode === "paste" ? "default" : "outline"}
          >
            <ClipboardIcon className="size-4" />
            Enter Text
          </Button>
        </div>

        <div className="py-2 overflow-hidden">
          {mode === "file" ? (
            <button
              className={cn(
                "flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 p-8 w-full text-left",
                "hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer"
              )}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <FileUpIcon className="size-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">Click to upload</p>
                <p className="text-xs text-muted-foreground">
                  or drag and drop a text file
                </p>
              </div>
              <input
                accept=".txt,.md,.text"
                className="hidden"
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
            </button>
          ) : (
            <>
              <Textarea
                className="h-[200px] w-full overflow-auto font-mono text-xs whitespace-pre resize-y [field-sizing:fixed]"
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Enter your text here as the first user message..."
                value={textContent}
              />
              <div className="flex flex-wrap gap-2 pt-3">
                {PRESET_SCENARIOS.map((scenario) => (
                  <Button
                    key={scenario}
                    onClick={() => setTextContent(scenario)}
                    size="sm"
                    variant={textContent === scenario ? "default" : "outline"}
                  >
                    {scenario}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={isLoading}
            onClick={() => handleOpenChange(false)}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={isLoading || !textContent.trim()}
            onClick={handleCreate}
          >
            {isLoading ? "Creating..." : "Create Chat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}