import type { ReactNode } from "react";
import { getNodeCatalogEntry } from "./node-schemas";

function IconPaths({ nodeType }: { nodeType: string }): ReactNode {
  switch (nodeType) {
    case "trigger.manual":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8.5v7l5.5-3.5z" fill="currentColor" stroke="none" />
        </>
      );
    case "trigger.file-added":
      return (
        <>
          <path d="M14 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6" />
          <path d="M12 14v4M10 16h4" />
        </>
      );
    case "trigger.user-input":
      return (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 10h8M8 14h5" />
          <path d="M16 3v3M8 3v3" />
        </>
      );
    case "file.pick":
      return (
        <>
          <path d="M4 7h5l2 2h9v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7z" />
          <path d="M9 13h6" />
        </>
      );
    case "doc.extract":
      return (
        <>
          <path d="M8 4h8l4 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          <path d="M16 4v4h4" />
          <path d="M8 12h8M8 16h5" />
        </>
      );
    case "wiki.ingest":
      return (
        <>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <path d="M12 8v6M9 11h6" />
        </>
      );
    case "wiki.query":
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </>
      );
    case "wiki.query-batch":
      return (
        <>
          <circle cx="9" cy="10" r="5" />
          <circle cx="15" cy="14" r="5" />
          <path d="M18 18l3 3" />
        </>
      );
    case "llm.chat":
      return (
        <>
          <path d="M7 9h10M7 13h6" />
          <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 3V6a2 2 0 0 1 2-2z" />
          <path d="M17 3l1.5 2.5L20 3" strokeLinecap="round" />
        </>
      );
    case "branch.if":
      return (
        <>
          <path d="M6 3v7a3 3 0 0 0 3 3h6" />
          <path d="M18 3v7a3 3 0 0 1-3 3H9" />
          <circle cx="6" cy="3" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="18" cy="3" r="1.5" fill="currentColor" stroke="none" />
        </>
      );
    case "workflow.subworkflow":
      return (
        <>
          <rect x="3" y="5" width="14" height="10" rx="1.5" />
          <rect x="7" y="9" width="14" height="10" rx="1.5" />
        </>
      );
    case "vault.backup.push":
      return (
        <>
          <path d="M12 16V7" />
          <path d="M8.5 10.5L12 7l3.5 3.5" />
          <path d="M5 19h14" />
          <path d="M7 5h10l2 4H5l2-4z" />
        </>
      );
    case "vault.backup.pull":
      return (
        <>
          <path d="M12 8v9" />
          <path d="M8.5 13.5L12 17l3.5-3.5" />
          <path d="M5 5h14" />
          <path d="M7 15h10l2-4H5l2 4z" />
        </>
      );
    case "output.notice":
      return (
        <>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
          <path d="M10.5 20a1.5 1.5 0 0 0 3 0" />
        </>
      );
    case "output.text":
      return (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M8 13h8M8 17h5" />
        </>
      );
    default:
      return <rect x="5" y="5" width="14" height="14" rx="2" />;
  }
}

export function NodeIcon({
  nodeType,
  size = 16,
  className,
}: {
  nodeType: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <IconPaths nodeType={nodeType} />
    </svg>
  );
}
