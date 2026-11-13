"use client";

import { useState } from "react";

export default function ShareLink({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/r/${id}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div className="sharebar">
      <span className="sharebar__label">Link to this report</span>
      <input
        className="input"
        readOnly
        value={url}
        aria-label="Report link"
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" className="btn btn--quiet btn--small" onClick={copy}>
        {copied ? "Link copied" : "Copy link"}
      </button>
      <span className="sr-only" role="status">{copied ? "Link copied" : ""}</span>
    </div>
  );
}
