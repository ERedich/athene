import type { TFunction } from "i18next";
import {
  ArrowLeftRight,
  File,
  FileText,
  Link2,
  Package,
  Pencil,
  Plus,
  Star,
  Trash2,
  Truck,
} from "lucide-react";

import type { BigMenuItem, BigMenuSection } from "../components/contextMenu/bigMenuTypes";
import { LucideSpinner, lucidePrimeBtnIcon } from "../icons/lucide";

/** Minimal spare-part fields needed by the big context menu. */
export type SparePartBigMenuRow = {
  id: string;
  key: string;
  name: string;
  siteKey: string;
  articleNumber: string | null;
  stockControlLines?: unknown[] | null;
};

export type SparePartBigMenuHandlers = {
  onAskAthene: (row: SparePartBigMenuRow) => void;
  atheneBusy: boolean;
  onCreate: () => void;
  onEdit: (row: SparePartBigMenuRow) => void;
  onDelete: (row: SparePartBigMenuRow) => void;
  onOpenDocuments: (row: SparePartBigMenuRow) => void;
  onOpenTransactions: (row: SparePartBigMenuRow) => void;
  onOpenSuppliers: (row: SparePartBigMenuRow) => void;
};

export type SparePartBigMenuModel = {
  header: string | null;
  cornerAction: BigMenuItem;
  sections: BigMenuSection[];
};

export type SparePartBigMenuPermissions = {
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
};

export function buildSparePartBigMenuModel(
  row: SparePartBigMenuRow | null,
  t: TFunction,
  handlers: SparePartBigMenuHandlers,
  perms?: SparePartBigMenuPermissions,
): SparePartBigMenuModel {
  const p = {
    canCreate: perms?.canCreate ?? true,
    canUpdate: perms?.canUpdate ?? true,
    canDelete: perms?.canDelete ?? true,
  };
  const hasRow = row != null;

  const cornerAction: BigMenuItem = {
    id: "ask-athene",
    label: t("assistant.askAthene"),
    className: "app-context-menu-athene",
    icon: handlers.atheneBusy ? (
      <LucideSpinner className={lucidePrimeBtnIcon} strokeWidth={1.75} />
    ) : (
      <Star className={lucidePrimeBtnIcon} strokeWidth={1.75} />
    ),
    disabled: !hasRow || handlers.atheneBusy,
    onSelect: () => {
      if (row) handlers.onAskAthene(row);
    },
  };

  const row1: BigMenuSection = {
    id: "row1",
    variant: "primary",
    items: [
      ...(p.canCreate
        ? [
            {
              id: "new",
              label: t("spareParts.new"),
              icon: <Plus className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
              onSelect: () => handlers.onCreate(),
            },
          ]
        : []),
      ...(p.canUpdate
        ? [
            {
              id: "edit",
              label: t("spareParts.edit"),
              icon: <Pencil className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
              disabled: !hasRow,
              onSelect: () => {
                if (row) handlers.onEdit(row);
              },
            },
          ]
        : []),
      {
        id: "documents",
        label: t("spareParts.bigMenu.documents"),
        icon: <File className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !hasRow,
        onSelect: () => {
          if (row) handlers.onOpenDocuments(row);
        },
      },
      {
        id: "usage",
        label: t("spareParts.bigMenu.usage"),
        icon: <Link2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: true,
        onSelect: () => {},
      },
    ],
  };

  const row2: BigMenuSection = {
    id: "row2",
    variant: "primary",
    items: [
      {
        id: "withdrawal",
        label: t("spareParts.bigMenu.withdrawal"),
        icon: <Package className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: true,
        onSelect: () => {},
      },
      {
        id: "banf",
        label: t("spareParts.bigMenu.banf"),
        icon: <FileText className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: true,
        onSelect: () => {},
      },
      {
        id: "transactions",
        label: t("spareParts.bigMenu.transactions"),
        icon: <ArrowLeftRight className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !hasRow,
        onSelect: () => {
          if (row) handlers.onOpenTransactions(row);
        },
      },
      {
        id: "supplier",
        label: t("spareParts.bigMenu.supplier"),
        icon: <Truck className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !hasRow,
        onSelect: () => {
          if (row) handlers.onOpenSuppliers(row);
        },
      },
    ],
  };

  const editSection: BigMenuSection | null = p.canDelete
    ? {
        id: "edit-actions",
        title: t("spareParts.bigMenu.sectionEdit"),
        variant: "column",
        items: [
          {
            id: "delete",
            label: t("spareParts.delete"),
            icon: <Trash2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
            disabled: !hasRow,
            danger: true,
            onSelect: () => {
              if (row) handlers.onDelete(row);
            },
          },
        ],
      }
    : null;

  return {
    header: hasRow ? `${row.key} · ${row.name}` : null,
    cornerAction,
    sections: [row1, row2, ...(editSection ? [editSection] : [])],
  };
}
