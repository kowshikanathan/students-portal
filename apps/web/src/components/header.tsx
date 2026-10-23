'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { SmartLink } from './links';

export function Header({
  navigation,
  name = 'Dodo',
}: {
  navigation: { label: string; href: string }[];
  name?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    setOpen(false);
    ref.current?.querySelectorAll('details').forEach((d) => {
      d.open = false;
    });
  }, [pathname]);

  return (
    <header className="site-header" ref={ref}>
      <div className="header-inner">
        {/* Left: Brand Logo */}
        <div className="header-left">
          <Link className="brand brand-wordmark" href="/" aria-label={name + ' home'}>
            <span className="brand-mark" aria-hidden="true">
              ◆
            </span>
            <strong>{name}</strong>
          </Link>
        </div>

        {/* Mobile Toggle Button */}
        <button
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="main-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Close ✕' : 'Menu ☰'}
        </button>

        {/* Center: Horizontally Centered Pill Navigation */}
        <div className="header-center">
          <nav
            id="main-navigation"
            aria-label="Main navigation"
            className={open ? 'navigation is-open' : 'navigation'}
          >
            <div className="nav-pill-container">
              {navigation.map((n) =>
                n.label === 'Products' ? (
                  <details className="nav-dropdown" key={n.href}>
                    <summary className={pathname.startsWith('/products') ? 'active' : ''}>
                      Products <span aria-hidden="true">⌄</span>
                    </summary>
                    <div>
                      <SmartLink href="/products/">For educational institutes</SmartLink>
                      <SmartLink href="/products/#flex">AutoCollect · Recurring collections</SmartLink>
                      <SmartLink href="/products/#fees">Fee Management</SmartLink>
                      <SmartLink href="/contact-us/">For businesses</SmartLink>
                    </div>
                  </details>
                ) : (
                  <SmartLink
                    key={n.href}
                    href={n.href}
                    className={'nav-pill-item' + (pathname === n.href ? ' active' : '')}
                  >
                    {n.label}
                  </SmartLink>
                ),
              )}
            </div>

            {/* In mobile toggle drawer mode, action links show inside drawer as well */}
            <div className="mobile-only-actions">
              <details className="nav-dropdown login-dropdown">
                <summary className="button outline login-link">
                  Login <span aria-hidden="true">⌄</span>
                </summary>
                <div>
                  <SmartLink href="/portal/">Student / Parent Login</SmartLink>
                  <SmartLink href="/admin/">Institution Login</SmartLink>
                </div>
              </details>
              <SmartLink href="/contact-us/" className="button primary">
                Book a demo
              </SmartLink>
            </div>
          </nav>
        </div>

        {/* Right: Actions */}
        <div className="header-right">
          <details className="nav-dropdown login-dropdown">
            <summary className="button outline login-link">
              Login <span aria-hidden="true">⌄</span>
            </summary>
            <div>
              <SmartLink href="/portal/">Student / Parent Login</SmartLink>
              <SmartLink href="/admin/">Institution Login</SmartLink>
            </div>
          </details>
          <SmartLink href="/contact-us/" className="button primary">
            Book a demo
          </SmartLink>
        </div>
      </div>
    </header>
  );
}
