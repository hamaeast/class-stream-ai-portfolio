import React, { createContext, useContext, useState, useCallback } from "react";

const PreviewContext = createContext(null);

// Lets an admin "become" a student to see the classroom as they see it.
// previewStudent === null means the admin is themselves.
export function PreviewProvider({ children }) {
  const [previewStudent, setPreviewStudent] = useState(null);
  const startPreview = useCallback((student) => setPreviewStudent(student), []);
  const exitPreview = useCallback(() => setPreviewStudent(null), []);
  return (
    <PreviewContext.Provider value={{ previewStudent, startPreview, exitPreview }}>
      {children}
    </PreviewContext.Provider>
  );
}

export const usePreview = () => useContext(PreviewContext);