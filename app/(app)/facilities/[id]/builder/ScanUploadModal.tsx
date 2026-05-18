"use client";

import { useState } from "react";
import { X, Upload, ScanLine, AlertTriangle, Sparkles } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { createClient } from "@/lib/supabase/client";
import type { DetectedSection } from "./types";

interface Props {
  onClose: () => void;
  onImport: (detected: DetectedSection[]) => void;
}

type Stage =
  | { kind: "idle" }
  | { kind: "uploading"; fileName: string }
  | { kind: "preview"; fileName: string; detected: DetectedSection[] }
  | { kind: "error"; message: string };

export function ScanUploadModal({ onClose, onImport }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const supabase = createClient();

  const handleFile = async (file: File) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setStage({ kind: "error", message: "File too large (max 4MB)." });
      return;
    }
    setStage({ kind: "uploading", fileName: file.name });

    const reader = new FileReader();
    reader.onerror = () =>
      setStage({ kind: "error", message: "Failed to read file." });
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");

      try {
        const { data, error } = await supabase.functions.invoke(
          "parse-warehouse-layout",
          {
            body: { image_base64: base64, mime_type: file.type },
          }
        );
        if (error) throw error;
        const detected = (data?.sections ?? []) as DetectedSection[];
        if (detected.length === 0) {
          setStage({
            kind: "error",
            message:
              "No sections detected. Try a clearer blueprint or use Add section manually.",
          });
          return;
        }
        setStage({ kind: "preview", fileName: file.name, detected });
      } catch (e) {
        setStage({
          kind: "error",
          message: e instanceof Error ? e.message : "Scan failed. Try again.",
        });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-title"
      className="fixed inset-0 flex items-start justify-center px-16 pt-[10vh]"
      style={{
        zIndex: 200,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] hairline bg-[var(--surface)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="hairline-b flex items-center justify-between px-16 py-12">
          <div>
            <p className="label-text text-text-muted inline-flex items-center gap-6">
              <Sparkles size={9} strokeWidth={1.5} />
              AI-assisted
            </p>
            <h2
              id="scan-title"
              className="text-text mt-2"
              style={{
                fontFamily: "var(--display)",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Scan blueprint
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hairline-subtle p-6 hover:border-[var(--border-hover)] text-text-secondary"
            aria-label="Close"
          >
            <X size={12} strokeWidth={1.5} />
          </button>
        </header>

        <div className="px-16 py-14 flex flex-col gap-14">
          {stage.kind === "idle" && (
            <>
              <p
                className="mono-sm text-text-muted"
                style={{ lineHeight: 1.6 }}
              >
                Upload a blueprint or sketch (PNG, JPG, WEBP, max 4MB). Claude
                will identify the labeled sections and lay them out on the
                canvas. You can refine before saving.
              </p>
              <label className="hairline-subtle border-dashed bg-[var(--surface-2)] hover:border-[var(--accent-soft)] transition-colors py-32 flex flex-col items-center gap-10 cursor-pointer">
                <Upload
                  size={20}
                  strokeWidth={1.5}
                  className="text-text-muted"
                />
                <span className="mono-sm text-text-secondary">
                  Click to choose an image
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </label>
              <p className="mono-sm text-text-dim" style={{ fontSize: 10 }}>
                Importing will replace the current section list on the canvas.
                Your save isn&apos;t committed until you press Save.
              </p>
            </>
          )}

          {stage.kind === "uploading" && (
            <div className="hairline-subtle bg-[var(--surface-2)] py-32 flex flex-col items-center gap-10">
              <ScanLine
                size={20}
                strokeWidth={1.5}
                className="text-[var(--accent)] animate-pulse"
              />
              <p className="mono-sm text-text">Analyzing {stage.fileName}…</p>
              <p className="label-text text-text-dim">~5–15 seconds</p>
            </div>
          )}

          {stage.kind === "preview" && (
            <>
              <div className="hairline-subtle bg-[var(--accent-dim)] px-14 py-10 inline-flex items-center gap-8">
                <Sparkles
                  size={11}
                  strokeWidth={1.5}
                  className="text-[var(--accent)]"
                />
                <span
                  className="text-[var(--accent)]"
                  style={{
                    fontFamily: "var(--display)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Detected {stage.detected.length}{" "}
                  {stage.detected.length === 1 ? "section" : "sections"}
                </span>
              </div>
              <ul className="hairline bg-[var(--surface-2)] divide-y divide-[var(--border-subtle)] max-h-[200px] overflow-y-auto">
                {stage.detected.map((d, i) => (
                  <li key={i} className="px-12 py-8 flex items-center gap-10">
                    <span
                      className="text-text shrink-0 w-28"
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {d.code}
                    </span>
                    <span className="flex-1 mono-sm text-text-secondary truncate">
                      {d.name}
                    </span>
                    <span className="label-text text-text-dim">
                      {d.approximate_bays}b × {d.approximate_levels}L
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-end gap-10">
                <CornerButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStage({ kind: "idle" })}
                >
                  Try another
                </CornerButton>
                <CornerButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => onImport(stage.detected)}
                >
                  Import {stage.detected.length} → canvas
                </CornerButton>
              </div>
            </>
          )}

          {stage.kind === "error" && (
            <div
              role="alert"
              className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-12 py-10 flex items-start gap-10"
            >
              <AlertTriangle
                size={11}
                strokeWidth={1.5}
                className="text-[var(--danger)] shrink-0 mt-2"
              />
              <div className="flex-1">
                <p
                  className="text-[var(--danger)]"
                  style={{
                    fontFamily: "var(--display)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Scan failed
                </p>
                <p className="mono-sm text-text-secondary mt-2">
                  {stage.message}
                </p>
              </div>
              <CornerButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStage({ kind: "idle" })}
              >
                Try again
              </CornerButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
