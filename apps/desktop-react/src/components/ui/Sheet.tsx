import type { ComponentProps } from "react";

import { Dialog } from "./Dialog";

export function Sheet(props: Omit<ComponentProps<typeof Dialog>, "variant">) {
  return <Dialog {...props} variant="sheet" />;
}
