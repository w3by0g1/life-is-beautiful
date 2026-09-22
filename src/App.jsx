import { useEffect, useRef } from "react";
import { createPaperScene } from "./paperScene.js";
import logoUrl from "./assets/logo.jpg";

function App() {
  const containerRef = useRef(null);

  useEffect(() => {
    let dispose;
    let cancelled = false;
    createPaperScene(containerRef.current, logoUrl).then((d) => {
      if (cancelled) d();
      else dispose = d;
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return (
    <>
      <div ref={containerRef} className="scene" />
    </>
  );
}

export default App;
