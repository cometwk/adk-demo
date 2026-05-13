"use client";

import { BugIcon } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function DebugPanel({ chatId }: { chatId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [debugLog, setDebugLog] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleOpen = async () => {
    setIsOpen(true);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/debug-log?chatId=${chatId}`);
      const data = await res.json();
      setDebugLog(data);
    } catch (e) {
      setDebugLog({ error: String(e) });
    }
    setIsLoading(false);
  };

  return (
    <>
      <Button
        className="absolute bottom-4 right-4 z-50 size-8"
        onClick={handleOpen}
        size="icon"
        variant="ghost"
      >
        <BugIcon className="size-4" />
      </Button>

      <Dialog onOpenChange={setIsOpen} open={isOpen}>
        <DialogContent className="flex flex-col w-[80vw] max-w-[calc(100%-2rem)] sm:max-w-[80vw] h-[80vh] !gap-0">
          <DialogHeader className="shrink-0 pb-4">
            <DialogTitle>Debug Log</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {isLoading ? (
              <div className="text-muted-foreground">Loading...</div>
            ) : (
              <pre className="h-full w-full bg-muted/30 rounded p-3 text-xs font-mono overflow-auto whitespace-pre-wrap break-all">
                {typeof debugLog === "string"
                  ? debugLog
                  : JSON.stringify(debugLog, null, 2)}
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}