"use client";

import { ClipboardIcon, FileUpIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { importChatFromJSON } from "@/app/(chat)/actions";
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

type ImportMode = "file" | "paste";

interface ImportJsonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportJsonDialog({
  open,
  onOpenChange,
}: ImportJsonDialogProps) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [mode, setMode] = useState<ImportMode>("file");
  const [jsonContent, setJsonContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.name.endsWith(".json")) {
      toast.error("Please select a JSON file");
      return;
    }

    setIsLoading(true);
    try {
      const content = await file.text();
      setJsonContent(content);
      setMode("paste"); // Switch to paste mode to show the content
    } catch {
      toast.error("Failed to read file");
    }
    setIsLoading(false);
  };

  const handleImport = async () => {
    if (!jsonContent.trim()) {
      toast.error("Please provide JSON content");
      return;
    }

    setIsLoading(true);
    try {
      const result = await importChatFromJSON({ jsonString: jsonContent });

      if (result.error) {
        toast.error(result.error);
        setIsLoading(false);
        return;
      }

      // Refresh history list
      mutate(unstable_serialize(getChatHistoryPaginationKey));

      // Close dialog and navigate to the new chat
      onOpenChange(false);
      setJsonContent("");
      router.push(`/chat/${result.chatId}`);

      toast.success("Chat imported successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      toast.error(message);
    }
    setIsLoading(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setJsonContent("");
      setMode("file");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Chat from JSON</DialogTitle>
          <DialogDescription>
            Upload a JSON file or paste JSON content from OpenAI API format.
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
            Paste JSON
          </Button>
        </div>

        <div className="min-h-[200px]">
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
                  or drag and drop a JSON file
                </p>
              </div>
              <input
                accept=".json"
                className="hidden"
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
            </button>
          ) : (
            <Textarea
              className="min-h-[200px] font-mono text-xs"
              onChange={(e) => setJsonContent(e.target.value)}
              placeholder="Paste your JSON content here..."
              value={jsonContent}
            />
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
            disabled={isLoading || !jsonContent.trim()}
            onClick={handleImport}
          >
            {isLoading ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
