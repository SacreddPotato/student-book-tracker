import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactElement, ReactNode } from "react";

export function Dialog({
  trigger,
  title,
  description,
  children,
  footer,
  open,
  onOpenChange,
  variant = "dialog",
}: {
  trigger?: ReactElement;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  variant?: "dialog" | "sheet";
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-dialog-overlay" />
        <DialogPrimitive.Content className="ui-dialog-content" data-variant={variant}>
          <div className="ui-dialog-header">
            <div>
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description>{description}</DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close className="ui-icon-button" aria-label="Close">
              <X size={18} aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="ui-dialog-body">{children}</div>
          {footer ? <div className="ui-dialog-footer">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const DialogClose = DialogPrimitive.Close;
