// src/components/Footer.js
import {
  Facebook,
  Instagram,
  Twitter,
  Google,
  Linkedin,
  Github,
} from 'react-bootstrap-icons';

import config from '../config.json'; // pull verified addresses

export default function Footer() {
  // put your real profile URLs here
  const links = {
    facebook:  'https://facebook.com',
    instagram: 'https://instagram.com',
    twitter:   'https://twitter.com',
    google:    'https://google.com',
    linkedin:  'https://linkedin.com',
    github:    'https://github.com',
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

  const sender   = config['11155111']?.senderSepolia;
  const receiver = config['43113']?.receiverFuji;

  return (
    <footer className="fixed-bottom z-0" style={{ background: 'var(--bs-body-bg)' }}>
      <div className="container">
        {/* top row: © | contracts | social */}
        <div className="d-flex align-items-center justify-content-between pt-3 pb-2 flex-wrap gap-2 position-relative">
          {/* left © */}
          <p className="mb-0 text-body-secondary">© 2025</p>

          {/* center contracts */}
          <div className="position-absolute start-50 translate-middle-x" style={{ minWidth: 'max-content' }}>
            <div className="d-flex align-items-center gap-3 small">
              <span className="text-body-secondary">Contracts:</span>

              <a
                href={`https://sepolia.etherscan.io/address/${sender}#code`}
                target="_blank"
                rel="noreferrer"
                className="badge rounded-pill text-decoration-none bg-success-subtle text-success-emphasis border border-success-subtle"
                title="USDCSender (Sepolia) – Verified on Etherscan"
              >
                Sender (Sepolia) ↗
              </a>

              <a
                href={`https://testnet.snowtrace.io/address/${receiver}#code`}
                target="_blank"
                rel="noreferrer"
                className="badge rounded-pill text-decoration-none bg-success-subtle text-success-emphasis border border-success-subtle"
                title="USDCReceiver (Fuji) – Verified on Snowtrace"
              >
                Receiver (Fuji) ↗
              </a>
            </div>
          </div>

          {/* right socials */}
          <div className="d-flex gap-2 ms-auto">
            <IconBtn href={links.facebook}  label="Facebook"><Facebook size={18} /></IconBtn>
            <IconBtn href={links.instagram} label="Instagram"><Instagram size={18} /></IconBtn>
            <IconBtn href={links.twitter}   label="Twitter"><Twitter size={18} /></IconBtn>
            <IconBtn href={links.google}    label="Google"><Google size={18} /></IconBtn>
            <IconBtn href={links.linkedin}  label="LinkedIn"><Linkedin size={18} /></IconBtn>
            <IconBtn href={links.github}    label="GitHub"><Github size={18} /></IconBtn>
          </div>
        </div>

        {/* optional thin divider */}
        <div className="border-top" style={{ opacity: 0.1 }} />
      </div>
    </footer>
  );
}
