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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DebugData = {
  facts: unknown;
  workspace: unknown;
};

export function DebugPanel({ chatId }: { chatId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleOpen = async () => {
    setIsOpen(true);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/debug-log?chatId=${chatId}`);
      const data = await res.json();
      setDebugData(data);
    } catch (e) {
      setDebugData({ facts: { error: String(e) }, workspace: { error: String(e) } });
    }
    setIsLoading(false);
  };

  const renderContent = (data: unknown) => {
    if (isLoading) {
      return <div className="text-muted-foreground">Loading...</div>;
    }
    return (
      <pre className="h-full w-full bg-muted/30 rounded p-3 text-xs font-mono overflow-auto whitespace-pre-wrap break-all">
        {typeof data === "string"
          ? data
          : JSON.stringify(data, null, 2)}
      </pre>
    );
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
          <Tabs defaultValue="facts" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="shrink-0">
              <TabsTrigger value="facts">Facts</TabsTrigger>
              <TabsTrigger value="workspace">Workspace</TabsTrigger>
            </TabsList>
            <TabsContent value="facts" className="flex-1 min-h-0 mt-2">
              {renderContent(debugData?.facts)}
            </TabsContent>
            <TabsContent value="workspace" className="flex-1 min-h-0 mt-2">
              {renderContent(debugData?.workspace)}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}