"use client";

import React from "react";
import Link from "next/link";
import { Boxes, ChevronRight, ArrowLeft } from "lucide-react";
import { AC, ARCH_FONT } from "@/lib/arch-ui";

export interface Crumb {
  label: string;
  href?: string;
}

export default function ArchHeader({
  title,
  subtitle,
  crumbs,
  right,
}: {
  title: string;
  subtitle?: string;
  crumbs: Crumb[];
  right?: React.ReactNode;
}) {
  return (
    <header
      style={{
        fontFamily: ARCH_FONT,
        background: "rgba(255,255,255,0.72)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderBottom: `1px solid ${AC.line}`,
        padding: "13px 22px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        zIndex: 5,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: AC.ink,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Boxes size={18} color="#fff" />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: AC.faint }}>
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight size={13} color={AC.hair} />}
                {c.href ? (
                  <Link href={c.href} style={{ color: AC.accent, textDecoration: "none" }}>
                    {c.label}
                  </Link>
                ) : (
                  <span style={{ color: AC.muted }}>{c.label}</span>
                )}
              </React.Fragment>
            ))}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em", color: AC.ink, marginTop: 1 }}>
            {title}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {subtitle && (
          <span style={{ fontSize: 13, color: AC.muted, maxWidth: 380 }} className="arch-sub">
            {subtitle}
          </span>
        )}
        {right}
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: AC.muted,
            textDecoration: "none",
            border: `1px solid ${AC.line}`,
            borderRadius: 999,
            padding: "6px 12px",
            background: AC.paper,
          }}
        >
          <ArrowLeft size={14} /> Console
        </Link>
      </div>
      <style>{`@media (max-width: 680px){ .arch-sub{ display:none } }`}</style>
    </header>
  );
}
