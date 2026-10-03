import Link from "next/link";
import { ArrowRight } from "lucide-react";
import "./foot.css";

/**
 * WheatGuard AI — Footer (matches the mockup).
 * A photo-backed CTA band ("Ready to Protect Your Wheat?") over a dark-green
 * footer with Product / Resources / Company link columns and a Social column.
 * Styles live in foot.css. Social marks use inline SVGs because the installed
 * lucide-react version no longer ships brand icons.
 */

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Diseases", href: "/#diseases" },
      { label: "How It Works", href: "/#how-it-works" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "#" },
      { label: "AI Resources", href: "#" },
      { label: "Tutorials", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/#about" },
      { label: "Owners", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
];

const SOCIALS = [
  {
    label: "Twitter",
    href: "#",
    path: "M23.953 4.57a10 10 0 0 1-2.825.775 4.958 4.958 0 0 0 2.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 0 0-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 0 0-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 0 1-2.228-.616v.06a4.923 4.923 0 0 0 3.946 4.827 4.996 4.996 0 0 1-2.212.085 4.936 4.936 0 0 0 4.604 3.417 9.867 9.867 0 0 1-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 0 0 7.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0 0 24 4.59z",
  },
  {
    label: "LinkedIn",
    href: "#",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  {
    label: "Instagram",
    href: "#",
    path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z",
  },
  {
    label: "YouTube",
    href: "#",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
];

export default function Footer() {
  return (
    <footer className="wheat-footer">
      {/* CTA band */}
      <section className="footer-cta">
        <div className="footer-cta-content">
          <h2 className="footer-cta-title">Ready to Protect Your Wheat?</h2>
          <p className="footer-cta-description">
            Detect wheat diseases early, understand your results, and take the right action with
            WheatGuard AI.
          </p>
          <Link href="/login" className="footer-cta-button">
            Start Disease Detection
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Main footer */}
      <div className="footer-main">
        <div className="footer-container">
          <div className="footer-grid">
            {COLUMNS.map(({ title, links }) => (
              <div className="footer-column" key={title}>
                <h3>{title}</h3>
                <div className="footer-links">
                  {links.map(({ label, href }) => (
                    <a key={label} href={href}>
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            ))}

            <div className="footer-column">
              <h3>Social</h3>
              <div className="social-links">
                {SOCIALS.map(({ label, href, path }) => (
                  <a
                    key={label}
                    href={href}
                    className="social-link"
                    aria-label={label}
                    target={href === "#" ? undefined : "_blank"}
                    rel="noreferrer"
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                      <path d={path} />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <p className="footer-copyright">© 2024 WheatGuard AI. All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
