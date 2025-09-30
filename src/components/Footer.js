// src/components/Footer.js
import {
  Facebook,
  Instagram,
  Twitter,
  Google,
  Linkedin,
  Github
} from 'react-bootstrap-icons';

export default function Footer() {
  // put your real profile URLs here
  const links = {
    facebook:  'https://facebook.com',
    instagram: 'https://instagram.com',
    twitter:   'https://twitter.com',
    google:    'https://google.com',
    linkedin:  'https://linkedin.com',
    github:    'https://github.com'
  };

  // tiny helper for a rounded icon button
  const IconBtn = ({ href, label, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      className="btn btn-outline-secondary btn-sm rounded-circle d-inline-flex align-items-center justify-content-center"
      style={{ width: 36, height: 36 }}
    >
      {children}
    </a>
  );

  return (
    <footer className="fixed-bottom z-0" // 👈 add z-0
      style={{ background: 'var(--bs-body-bg)' }}
    >
      <div className="container">
        <div
          className="d-flex align-items-center justify-content-between pt-3 pb-3"
        >
          <p className="mb-0 text-body-secondary">© 2025 Company, Inc</p>

          <div className="d-flex gap-2">
            <IconBtn href={links.facebook}  label="Facebook"><Facebook size={18} /></IconBtn>
            <IconBtn href={links.instagram} label="Instagram"><Instagram size={18} /></IconBtn>
            <IconBtn href={links.twitter}   label="Twitter"><Twitter size={18} /></IconBtn>
            <IconBtn href={links.google}    label="Google"><Google size={18} /></IconBtn>
            <IconBtn href={links.linkedin}  label="LinkedIn"><Linkedin size={18} /></IconBtn>
            <IconBtn href={links.github}    label="GitHub"><Github size={18} /></IconBtn>
          </div>
        </div>
      </div>
    </footer>
  );
}


