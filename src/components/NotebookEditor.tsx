// src/components/NotebookEditor.tsx
"use client";

import { EditorContent, type Editor } from "@tiptap/react";

export default function NotebookEditor({ editor }: { editor: Editor | null }) {
  return (
    <div>
      <EditorContent editor={editor} />
    </div>
  );
}
