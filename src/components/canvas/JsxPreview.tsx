import { useState, useEffect, useRef, useMemo } from "react";
import { transform } from "sucrase";
import React from "react";
import ReactDOM from "react-dom/client";

type Props = {
  code: string;
  title: string;
};

function transpileJsx(code: string): { output: string; error: string | null } {
  try {
    const result = transform(code, {
      transforms: ["jsx", "typescript", "imports"],
      jsxRuntime: "classic",
      production: true,
    });
    return { output: result.code, error: null };
  } catch (e) {
    return { output: "", error: (e as Error).message };
  }
}

export function JsxPreview({ code, title }: Props) {
  const [debouncedCode, setDebouncedCode] = useState(code);
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<ReturnType<typeof ReactDOM.createRoot> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedCode(code);
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [code]);

  const { element, error } = useMemo(() => {
    const result = transpileJsx(debouncedCode);
    if (result.error) {
      return { element: null, error: result.error };
    }

    try {
      const exports: Record<string, unknown> = {};
      const module = { exports };
      const require = (name: string) => {
        const mods: Record<string, unknown> = {
          react: React,
          "react-dom": ReactDOM,
          "react-dom/client": ReactDOM,
        };
        if (mods[name]) return mods[name];
        throw new Error("Module not found: " + name);
      };
      new Function(
        "exports",
        "module",
        "require",
        "React",
        "ReactDOM",
        result.output,
      )(exports, module, require, React, ReactDOM);

      const Component = (exports.default ||
        exports.App ||
        module.exports.default ||
        module.exports) as React.ComponentType | React.ReactElement;

      if (typeof Component === "function") {
        return { element: React.createElement(Component), error: null };
      }
      if (
        Component &&
        typeof Component === "object" &&
        "$$typeof" in Component
      ) {
        return { element: Component as React.ReactElement, error: null };
      }
      return {
        element: null,
        error:
          "No default export found. Export a React component as default.",
      };
    } catch (e) {
      return { element: null, error: (e as Error).message };
    }
  }, [debouncedCode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create a standalone DOM element outside React's reconciler
    if (!rootRef.current) {
      const renderTarget = document.createElement("div");
      renderTarget.style.minHeight = "100%";
      container.appendChild(renderTarget);
      rootRef.current = ReactDOM.createRoot(renderTarget);
    }

    if (error) {
      rootRef.current.render(
        React.createElement(
          "div",
          {
            style: {
              color: "#ef4444",
              padding: "16px",
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
              fontSize: "13px",
            },
          },
          error,
        ),
      );
    } else if (element) {
      try {
        rootRef.current.render(element);
      } catch (e) {
        rootRef.current.render(
          React.createElement(
            "div",
            {
              style: {
                color: "#ef4444",
                padding: "16px",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                fontSize: "13px",
              },
            },
            (e as Error).message,
          ),
        );
      }
    }
  }, [element, error]);

  useEffect(() => {
    return () => {
      setTimeout(() => {
        rootRef.current?.unmount();
        rootRef.current = null;
      }, 0);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      title={title}
      className="w-full h-full bg-white rounded-lg overflow-auto"
      style={{ minHeight: "100%" }}
    />
  );
}
