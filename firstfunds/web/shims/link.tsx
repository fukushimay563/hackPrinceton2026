import type { AnchorHTMLAttributes, ReactNode } from "react";
import { toHash } from "./routes";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; children?: ReactNode; prefetch?: boolean };

export default function Link({ href, children, prefetch: _prefetch, onClick, ...rest }: Props) {
  void _prefetch;
  const external = /^https?:/.test(href);
  return (
    <a
      href={toHash(href)}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (!external) window.scrollTo({ top: 0 });
      }}
    >
      {children}
    </a>
  );
}
